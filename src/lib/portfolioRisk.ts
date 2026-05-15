import { HoldingStock, RiskLevel, StockRiskResult, StockRiskSignal } from "@/types/portfolioRisk";

export type MarketRiskInput = {
  market: "KOSPI" | "KOSDAQ";
  market_risk_score: number;
  market_risk_level: RiskLevel;
};

export type StockTechnicalInput = {
  close: number;
  ma20?: number;
  ma60?: number;
  ma120?: number;
  volume?: number;
  avg_volume_20?: number;
};

function getRiskLevel(score: number): RiskLevel {
  if (score >= 70) return "danger";
  if (score >= 40) return "caution";
  return "safe";
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function hasNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

export function diagnoseHoldingStockRisk(stock: HoldingStock, marketRisk?: MarketRiskInput, technical?: StockTechnicalInput): StockRiskResult {
  const signals: StockRiskSignal[] = [];

  const valuationAmount = stock.current_price * stock.quantity;
  const buyAmount = stock.buy_price * stock.quantity;

  const profitRate = stock.buy_price > 0 ? ((stock.current_price - stock.buy_price) / stock.buy_price) * 100 : 0;
  const lossAmount = valuationAmount - buyAmount;

  let riskScore = 0;

  // 1) 손실률 기반
  if (profitRate <= -20) {
    riskScore += 35;
    signals.push({
      signal_type: "loss_over_20",
      severity: "danger",
      score_delta: 35,
      title: "손실률 -20% 초과",
      description: `${stock.stock_name}의 손실률이 ${round2(profitRate)}%입니다. 손실 관리가 필요한 구간입니다.`
    });
  } else if (profitRate <= -10) {
    riskScore += 22;
    signals.push({
      signal_type: "loss_over_10",
      severity: "caution",
      score_delta: 22,
      title: "손실률 -10% 초과",
      description: `${stock.stock_name}의 손실률이 ${round2(profitRate)}%입니다. 추가 하락 시 비중 축소 검토가 필요합니다.`
    });
  } else if (profitRate <= -5) {
    riskScore += 10;
    signals.push({
      signal_type: "loss_over_5",
      severity: "caution",
      score_delta: 10,
      title: "손실률 -5% 초과",
      description: `${stock.stock_name}이 약손실 구간에 진입했습니다.`
    });
  }

  // 2) KOSDAQ 가중
  if (stock.market === "KOSDAQ") {
    riskScore += 7;
    signals.push({
      signal_type: "kosdaq_volatility_weight",
      severity: "caution",
      score_delta: 7,
      title: "KOSDAQ 변동성 가중",
      description: "KOSDAQ 종목은 시장 하락 시 변동성이 커질 수 있어 위험 점수에 가중치를 반영했습니다."
    });
  }

  // 3) 시장 위험 반영
  if (marketRisk) {
    if (marketRisk.market_risk_level === "danger") {
      riskScore += 25;
      signals.push({
        signal_type: "market_danger",
        severity: "danger",
        score_delta: 25,
        title: `${stock.market} 시장 위험`,
        description: "현재 해당 시장의 위험 신호가 danger 상태입니다. 개별 종목 리스크도 함께 상승합니다."
      });
    } else if (marketRisk.market_risk_level === "caution") {
      riskScore += 12;
      signals.push({
        signal_type: "market_caution",
        severity: "caution",
        score_delta: 12,
        title: `${stock.market} 시장 주의`,
        description: "현재 해당 시장에 주의 신호가 발생했습니다. 보유 종목의 비중 점검이 필요합니다."
      });
    }
  }

  // 4) 기술적 신호 반영
  if (technical) {
    if (hasNumber(technical.ma20) && technical.close < technical.ma20) {
      riskScore += 10;
      signals.push({
        signal_type: "below_ma20",
        severity: "caution",
        score_delta: 10,
        title: "현재가 < 20일선",
        description: "단기 추세 약화 신호입니다."
      });
    }

    if (hasNumber(technical.ma60) && technical.close < technical.ma60) {
      riskScore += 20;
      signals.push({
        signal_type: "below_ma60",
        severity: "danger",
        score_delta: 20,
        title: "현재가 < 60일선",
        description: "중기 추세 훼손 신호입니다."
      });
    }

    if (hasNumber(technical.ma20) && hasNumber(technical.ma60) && technical.ma20 < technical.ma60) {
      riskScore += 18;
      signals.push({
        signal_type: "ma20_below_ma60",
        severity: "danger",
        score_delta: 18,
        title: "20일선 < 60일선",
        description: "추세 역배열로 하락 위험이 커질 수 있습니다."
      });
    }

    if (hasNumber(technical.volume) && hasNumber(technical.avg_volume_20) && technical.avg_volume_20 > 0) {
      const volumeSpike = technical.volume >= technical.avg_volume_20 * 2;
      const downDay = technical.close < stock.buy_price;
      if (volumeSpike && downDay) {
        riskScore += 20;
        signals.push({
          signal_type: "volume_spike_down",
          severity: "danger",
          score_delta: 20,
          title: "거래량 급증 + 하락",
          description: "평균 대비 거래량 급증과 하락이 동반되어 매도 압력이 커졌을 수 있습니다."
        });
      }
    }
  }

  // 5) 강제 danger: 시장 danger + 종목 손실 -10% 이상
  if (marketRisk?.market_risk_level === "danger" && profitRate <= -10) {
    riskScore = Math.max(riskScore, 70);
    signals.push({
      signal_type: "forced_danger_market_and_loss",
      severity: "danger",
      score_delta: 0,
      title: "강제 위험(danger)",
      description: "시장 danger와 종목 -10% 이상 손실이 겹쳐 위험 등급을 danger로 상향합니다."
    });
  }

  riskScore = Math.min(riskScore, 100);
  const riskLevel = getRiskLevel(riskScore);

  const recommendation = createRecommendation({
    stockName: stock.stock_name,
    profitRate,
    riskScore,
    riskLevel,
    marketRiskLevel: marketRisk?.market_risk_level
  });

  return {
    stock_code: stock.stock_code,
    stock_name: stock.stock_name,
    market: stock.market,
    profit_rate: round2(profitRate),
    loss_amount: Math.round(lossAmount),
    valuation_amount: Math.round(valuationAmount),
    risk_score: riskScore,
    risk_level: riskLevel,
    signals,
    recommendation
  };
}

export function diagnosePortfolioRisk(
  holdings: HoldingStock[],
  marketRisks: MarketRiskInput[],
  technicalByStockCode: Record<string, StockTechnicalInput | undefined> = {}
): StockRiskResult[] {
  return holdings.map((stock) => {
    const marketRisk = marketRisks.find((risk) => risk.market === stock.market);
    const technical = technicalByStockCode[stock.stock_code];
    return diagnoseHoldingStockRisk(stock, marketRisk, technical);
  });
}

function createRecommendation(params: {
  stockName: string;
  profitRate: number;
  riskScore: number;
  riskLevel: RiskLevel;
  marketRiskLevel?: RiskLevel;
}): string {
  const { stockName, profitRate, riskLevel, marketRiskLevel } = params;

  // 수익 중이지만 시장 danger
  if (profitRate > 0 && marketRiskLevel === "danger") {
    return `${stockName}은 수익 상태지만 시장 위험이 danger입니다. 일부 익절 또는 비중 축소를 권고합니다.`;
  }

  if (riskLevel === "danger") {
    if (profitRate < 0) {
      return `${stockName}은 현재 손실 상태에서 위험 신호가 강하게 발생했습니다. 추가 매수보다는 비중 축소 또는 손절 기준 재점검이 우선입니다.`;
    }
    return `${stockName}은 수익 상태이지만 위험 점수가 높습니다. 수익 보호를 위해 일부 익절 또는 추적 손절 기준을 설정하는 것이 좋습니다.`;
  }

  if (riskLevel === "caution") {
    if (profitRate < 0) {
      return `${stockName}은 주의 구간입니다. 바로 매도보다는 시장 신호와 종목 추세를 함께 확인하면서 추가 하락 시 축소 기준을 준비하는 것이 좋습니다.`;
    }
    return `${stockName}은 아직 심각한 위험 구간은 아니지만, 시장 변동성 확대에 대비해 보유 비중을 점검하는 것이 좋습니다.`;
  }

  return `${stockName}은 현재 위험 점수가 낮은 편입니다. 다만 시장 전체 위험 신호가 강화되는 경우 다시 점검해야 합니다.`;
}
