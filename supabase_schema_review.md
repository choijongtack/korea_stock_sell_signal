# Excel 파일 구조 → Supabase 적용 가능성 검토

## 3개 파일 & 5개 업로드 타입 요약

앱에서 사용하는 **3개의 Excel 파일 출처**와 **5개 업로드 타입**은 다음과 같습니다:

| # | 업로드 타입 | 파일 출처 | 저장 대상 테이블 |
|---|------------|----------|-----------------|
| 1 | `freesis_market_liquidity` | FreeSIS 증시자금추이 | `market_liquidity_daily` |
| 2 | `freesis_credit_balance` | FreeSIS 증시자금추이 | `market_liquidity_daily` |
| 3 | `freesis_cma` | FreeSIS CMA잔고추이 | `market_cma_daily` |
| 4 | `krx_index` | KRX 지수시세 | `market_index_daily` |
| 5 | `krx_investor_flow` | KRX 투자자별 매매 | `investor_flow_daily` |

> [!NOTE]
> 파일 1, 2번은 같은 FreeSIS 파일이지만 시트/영역이 다르며, 같은 `market_liquidity_daily` 테이블에 partial upsert (각각 다른 컬럼)로 합쳐집니다.

---

## 테이블별 적용 가능성

---

### 1. `market_liquidity_daily` — ✅ 정상 적용 가능

**코드가 보내는 필드 → DB 컬럼 매핑:**

| 코드 필드 (camelCase) | DB 컬럼 (snake_case) | DB 존재 | 상태 |
|----------------------|---------------------|---------|------|
| `tradeDate` | `trade_date` | ✅ | ✅ |
| `investorDepositMillionKrw` | `investor_deposit_million_krw` | ✅ | ✅ |
| `derivativesDepositMillionKrw` | `derivatives_deposit_million_krw` | ✅ | ✅ |
| `rpBalanceMillionKrw` | `rp_balance_million_krw` | ✅ | ✅ |
| `unsettledBalanceMillionKrw` | `unsettled_balance_million_krw` | ✅ | ✅ |
| `creditLoanMillionKrw` | `credit_loan_million_krw` | ✅ | ✅ |
| `creditShortMillionKrw` | `credit_short_million_krw` | ✅ | ✅ |
| `collateralLoanMillionKrw` | `collateral_loan_million_krw` | ✅ | ✅ |
| `totalCreditMillionKrw` | `total_credit_million_krw` | ✅ | ✅ |
| `createdAt` | `created_at` | ✅ | ✅ |

- **Unique 키**: `trade_date` → `onConflict: "trade_date"` ✅ 일치
- **실제 데이터**: 122건 저장 완료 ✅
- **결론**: **완벽 호환. 문제 없음.**

---

### 2. `market_index_daily` — ⚠️ 부분 적용 가능 (컬럼 누락)

**코드가 보내는 필드 → DB 컬럼 매핑:**

| 코드 필드 | DB 컬럼 | DB 존재 | 상태 |
|----------|---------|---------|------|
| `tradeDate` | `trade_date` | ✅ | ✅ |
| `market` | `market` | ✅ | ✅ |
| `close` | `close` | ✅ | ✅ |
| `change` | `change` | ✅ | ✅ |
| `changeRate` | `change_rate` | ✅ | ✅ |
| `open` | `open` | ❌ **없음** | 🔴 저장 안됨 |
| `high` | `high` | ❌ **없음** | 🔴 저장 안됨 |
| `low` | `low` | ❌ **없음** | 🔴 저장 안됨 |
| `volume` | `volume` | ✅ | ✅ |
| `tradingValueMillionKrw` | `trading_value_million_krw` | ✅ | ✅ |
| `createdAt` | `created_at` | ✅ | ✅ |

**DB에만 있고 코드에서 안 보내는 컬럼:**

| DB 컬럼 | 코드 | 영향 |
|---------|------|------|
| `market_cap_million_krw` | ❌ 안 보냄 | NULL로 저장 (허용) |
| `ma20` | ❌ 안 보냄 | NULL로 저장 (허용) |
| `ma60` | ❌ 안 보냄 | NULL로 저장 (허용) |
| `ma120` | ❌ 안 보냄 | NULL로 저장 (허용) |

- **Unique 키**: `(trade_date, market)` → `onConflict: "trade_date,market"` ✅ 일치
- **결론**: **upsert 자체는 에러 없이 동작하지만, `open/high/low` 데이터가 유실됩니다.**

> [!WARNING]
> **해결 방법**: DB에 3개 컬럼을 추가하면 됩니다.
> ```sql
> ALTER TABLE market_index_daily
>   ADD COLUMN open numeric,
>   ADD COLUMN high numeric,
>   ADD COLUMN low numeric;
> ```

---

### 3. `investor_flow_daily` — 🔴 적용 불가 (구조 완전 불일치)

이것이 가장 심각한 불일치입니다.

**코드가 보내는 구조** (1행 = 1일, 투자자별 순매수가 컬럼):
```
{ trade_date, foreign_net_buy, institution_net_buy, individual_net_buy, program_net_buy }
```
→ `onConflict: "trade_date"` 사용

**DB 실제 구조** (1행 = 1일 × 1시장 × 1투자자, 정규화된 행 분리):
```
{ trade_date, market, investor_type, sell_amount, buy_amount, net_buy_amount }
```
→ Unique 키: `(trade_date, market, investor_type)`

| 비교 | 코드 (앱 구조) | DB (현재) |
|------|---------------|-----------|
| 설계 철학 | **비정규화** (넓은 테이블) | **정규화** (좁은 테이블) |
| 1일치 데이터 | 1행 | N행 (투자자 × 시장) |
| `market` 필드 | ❌ 없음 (NOT NULL인데) | `text NOT NULL` |
| `investor_type` | ❌ 없음 (NOT NULL인데) | `text NOT NULL` |
| Conflict 키 | `trade_date` | `(trade_date, market, investor_type)` |

> [!CAUTION]
> **upsert 시 에러 발생**: 코드가 `onConflict: "trade_date"`로 보내지만, DB에는 `trade_date` 단독 unique 제약조건이 없고 `(trade_date, market, investor_type)` 복합 unique만 있습니다. 또한 `market`과 `investor_type`은 `NOT NULL`이므로 값을 안 보내면 INSERT 자체가 실패합니다.

**해결 방법 (택 1):**

#### 방법 A: DB를 코드에 맞추기 (권장 — 간단)

```sql
-- 기존 테이블 삭제 후 코드 구조에 맞게 재생성
DROP TABLE IF EXISTS investor_flow_daily;

CREATE TABLE investor_flow_daily (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  trade_date date NOT NULL UNIQUE,
  foreign_net_buy numeric,
  institution_net_buy numeric,
  individual_net_buy numeric,
  program_net_buy numeric,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE investor_flow_daily ENABLE ROW LEVEL SECURITY;
```

#### 방법 B: 코드를 DB에 맞추기 (복잡)

Excel에서 각 투자자별로 행을 분리해서 `market`, `investor_type`, `sell_amount`, `buy_amount`, `net_buy_amount`를 각각 보내도록 normalizer와 upsert 로직을 전면 수정해야 합니다.

---

### 4. `market_cma_daily` — 🔴 테이블 없음 (생성 필요)

코드에서 FreeSIS CMA 데이터를 정규화하여 저장하려 하지만, DB에 테이블이 존재하지 않습니다.

**해결 방법:**

```sql
CREATE TABLE market_cma_daily (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  trade_date date NOT NULL UNIQUE,
  rp_type_million_krw numeric,
  mmf_type_million_krw numeric,
  jonggeum_type_million_krw numeric,
  issuing_note_type_million_krw numeric,
  other_type_million_krw numeric,
  total_million_krw numeric,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE market_cma_daily ENABLE ROW LEVEL SECURITY;
```

---

## 전체 요약

| 파일/타입 | 대상 테이블 | 적용 가능? | 필요 조치 |
|----------|-----------|-----------|----------|
| FreeSIS 유동성 | `market_liquidity_daily` | ✅ **가능** | 없음 |
| FreeSIS 신용잔고 | `market_liquidity_daily` | ✅ **가능** | 없음 |
| FreeSIS CMA | `market_cma_daily` | 🔴 **불가** | 테이블 생성 필요 |
| KRX 지수시세 | `market_index_daily` | ⚠️ **부분 가능** | `open/high/low` 컬럼 추가 |
| KRX 투자자별 매매 | `investor_flow_daily` | 🔴 **불가** | DB 테이블 재설계 필요 |

### 수정하면 모두 적용 가능한가?

> [!IMPORTANT]
> **네, 위 3개 SQL을 실행하면 5개 타입 모두 Supabase에 정상 저장됩니다.**
> 1. `market_cma_daily` 테이블 생성
> 2. `market_index_daily`에 `open/high/low` 컬럼 추가
> 3. `investor_flow_daily` 테이블을 코드 구조에 맞게 재생성

이 3개 SQL을 바로 실행해 드릴까요?
