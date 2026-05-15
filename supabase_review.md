# Supabase 연동 검토 리포트

**프로젝트**: korea-stock-sell-signal  
**Supabase 프로젝트**: `cgrdeiizkstsrrhzcfoe` (리전: ap-northeast-2, 서울)  
**상태**: `ACTIVE_HEALTHY` ✅  
**Postgres 버전**: 17.6.1.121  
**검토일**: 2026-05-15

---

## 1. 연결 설정 ✅ 정상

| 항목 | .env.local 값 | Supabase 실제 값 | 일치 |
|------|---------------|-------------------|------|
| URL | `https://cgrdeiizkstsrrhzcfoe.supabase.co` | `https://cgrdeiizkstsrrhzcfoe.supabase.co` | ✅ |
| Anon Key | `sb_publishable_JXXDuy7bHr-m_...` (Publishable 키) | 동일 | ✅ |
| Service Role Key | `eyJhbG...` (JWT) | — (서버 전용, 노출 불가) | ✅ 설정됨 |

- **클라이언트** ([supabaseClient.ts](file:///c:/Users/jongt/JT_Academy/korea_stock_sell_signal/src/lib/supabaseClient.ts)): `NEXT_PUBLIC_SUPABASE_ANON_KEY`로 Publishable 키 사용 → 정상
- **서버 Admin** ([supabaseAdmin.ts](file:///c:/Users/jongt/JT_Academy/korea_stock_sell_signal/src/lib/supabaseAdmin.ts)): `import "server-only"` + Service Role Key → 서버 전용 보호 ✅

> [!TIP]
> Supabase에서 Legacy anon 키(`eyJhbG...`)도 활성 상태입니다. 새 Publishable 키(`sb_publishable_...`)를 이미 사용 중이므로, legacy 키가 불필요하면 비활성화를 권장합니다.

---

## 2. 데이터베이스 스키마 vs 코드 매핑

### 2.1 테이블 현황

| 테이블 | 행 수 | RLS | 인덱스 |
|--------|-------|-----|--------|
| `market_liquidity_daily` | **122** | ✅ ON | PK + `trade_date` UNIQUE |
| `market_index_daily` | **0** | ✅ ON | PK + `(trade_date, market)` UNIQUE |
| `investor_flow_daily` | **0** | ✅ ON | PK + `(trade_date, market, investor_type)` UNIQUE |
| `signal_events` | **0** | ✅ ON | PK만 |

### 2.2 코드-DB 스키마 불일치

> [!WARNING]
> **심각도: 높음** — 코드와 DB 스키마 사이에 여러 불일치가 발견되었습니다.

#### ❌ `market_index_daily` — DB에 `open`, `high`, `low` 컬럼 없음

코드 ([saveMarketData.ts:74-76](file:///c:/Users/jongt/JT_Academy/korea_stock_sell_signal/src/lib/saveMarketData.ts#L74-L76))에서 `open`, `high`, `low` 필드를 upsert하지만, DB 테이블에는 해당 컬럼이 **존재하지 않습니다**.

```diff
 DB 컬럼: id, trade_date, market, close, change, change_rate, volume,
          trading_value_million_krw, market_cap_million_krw, ma20, ma60, ma120, created_at

 코드가 보내는 추가 필드:
- open      ← DB에 없음
- high      ← DB에 없음
- low       ← DB에 없음
```

**영향**: Supabase는 정의되지 않은 컬럼을 무시하므로 에러는 나지 않지만, `open/high/low` 데이터가 **저장되지 않습니다**.

#### ❌ `market_index_daily` — 코드에서 `market_cap_million_krw`, `ma20`, `ma60`, `ma120` 미사용

DB에는 있지만 코드의 TypeScript 타입과 upsert 로직에서 빠져 있습니다.

```diff
 DB에만 있는 컬럼:
+ market_cap_million_krw
+ ma20, ma60, ma120
```

#### ❌ `investor_flow_daily` — DB 스키마와 코드 구조 완전 불일치

| DB 컬럼 | 코드에서 보내는 필드 |
|---------|---------------------|
| `market` (text) | ❌ 없음 |
| `investor_type` (text) | ❌ 없음 |
| `sell_amount_million_krw` | ❌ 없음 |
| `buy_amount_million_krw` | ❌ 없음 |
| `net_buy_amount_million_krw` | ❌ 없음 |
| ❌ 없음 | `foreign_net_buy` |
| ❌ 없음 | `institution_net_buy` |
| ❌ 없음 | `individual_net_buy` |
| ❌ 없음 | `program_net_buy` |

DB는 **투자자별 행 분리 구조** (market + investor_type 조합이 unique key)인데, 코드는 **단일 행에 투자자별 순매수를 컬럼으로 넣는 구조**입니다.

**영향**: `investor_flow_daily`에 데이터를 upsert하면 `onConflict: "trade_date"` 충돌 → DB의 unique 키는 `(trade_date, market, investor_type)`이므로 **에러가 발생**합니다.

#### ❌ `market_cma_daily` — DB에 테이블 자체가 없음

코드 ([saveMarketData.ts:112-133](file:///c:/Users/jongt/JT_Academy/korea_stock_sell_signal/src/lib/saveMarketData.ts#L112-L133))에서 `market_cma_daily` 테이블에 upsert를 시도하지만, DB에 해당 테이블이 **존재하지 않습니다**. API 라우트에서 `upsertCmaWithFallback` 함수로 fallback 처리는 하고 있지만, 결과적으로 실패합니다.

#### ❌ `signal_events` — DB 스키마와 코드 타입 불일치

| DB 컬럼 | 코드 TypeScript 타입 필드 |
|---------|--------------------------|
| `signal_type` (text) | `signalType: "sell" \| "reduce" \| "hold"` |
| `severity` (text) | ❌ 없음 |
| `score_delta` (numeric) | ❌ 없음 |
| `title` (text) | ❌ 없음 |
| `description` (text) | ❌ 없음 |
| ❌ 없음 | `ticker` |
| ❌ 없음 | `triggerScore` |
| ❌ 없음 | `triggerReason` |

---

## 3. 보안 검토

> [!CAUTION]
> **RLS 정책이 전혀 설정되지 않았습니다!**

4개 테이블 모두 RLS가 **ON**으로 활성화되어 있지만, **정책(Policy)이 0개**입니다.

| 테이블 | RLS 상태 | Policy 수 |
|--------|----------|-----------|
| `market_liquidity_daily` | ON | ❌ **0** |
| `market_index_daily` | ON | ❌ **0** |
| `investor_flow_daily` | ON | ❌ **0** |
| `signal_events` | ON | ❌ **0** |

**현재 영향**:
- **anon/publishable 키로는 모든 테이블 접근이 차단**됩니다 (RLS ON + 정책 없음 = 모든 요청 거부)
- [supabaseClient.ts](file:///c:/Users/jongt/JT_Academy/korea_stock_sell_signal/src/lib/supabaseClient.ts)의 anon 클라이언트로는 데이터 읽기/쓰기 불가
- [supabaseAdmin.ts](file:///c:/Users/jongt/JT_Academy/korea_stock_sell_signal/src/lib/supabaseAdmin.ts)의 Service Role 클라이언트만 RLS를 우회하여 작동
- **API 라우트** (`/api/upload-market-data`)에서 Service Role 사용 → 쓰기는 정상
- **클라이언트 측 직접 읽기**를 시도하면 빈 결과가 반환됨

---

## 4. 대시보드 페이지 — Supabase 데이터 미사용

> [!IMPORTANT]
> 메인 대시보드 ([page.tsx](file:///c:/Users/jongt/JT_Academy/korea_stock_sell_signal/src/app/page.tsx))는 **하드코딩된 mock 데이터**만 사용하고 있습니다.

```typescript
// page.tsx:74-78
export default function HomePage() {
  const liquidityData = createMockLiquidityData();  // ← Mock
  const indexData = createMockIndexData();            // ← Mock
  const flowData = createMockFlowData();              // ← Mock
  const risk = calculateMarketRisk(liquidityData, indexData, flowData);
```

Supabase에 122건의 유동성 데이터가 저장되어 있지만, 대시보드에서는 전혀 사용하지 않고 있습니다.

---

## 5. 성능 검토 ✅

- **퍼포먼스 어드바이저**: 경고 없음 ✅
- **인덱스**: 모든 테이블에 적절한 UNIQUE 인덱스 존재 ✅

---

## 6. 요약 및 권장 조치

### 🔴 즉시 수정 필요

| # | 항목 | 설명 |
|---|------|------|
| 1 | **`investor_flow_daily` 구조 불일치** | DB 스키마 또는 코드 중 하나를 수정해야 함. DB를 코드에 맞추려면 테이블 재설계 필요 |
| 2 | **RLS 정책 추가** | anon 키로 읽기가 필요하면 `SELECT` 정책 추가 필요. 쓰기는 API 라우트(Service Role)를 통해서만 허용하는 것이 적절 |
| 3 | **`market_cma_daily` 테이블 생성** | 코드에서 참조하지만 DB에 없음 |

### 🟡 개선 권장

| # | 항목 | 설명 |
|---|------|------|
| 4 | **`market_index_daily`에 `open`, `high`, `low` 컬럼 추가** | 코드에서 전송하지만 DB에 저장 안 됨 |
| 5 | **대시보드에서 실제 Supabase 데이터 로드** | mock → Supabase fetch로 전환 |
| 6 | **Legacy anon 키 비활성화 검토** | 새 Publishable 키 사용 중이므로 불필요 |

### ✅ 정상 항목

| # | 항목 |
|---|------|
| Supabase URL/Key 연결 | ✅ |
| 서버 Admin 클라이언트 보호 (server-only) | ✅ |
| API 라우트 구조 (Service Role로 서버 쓰기) | ✅ |
| `market_liquidity_daily` 정상 동작 (122건) | ✅ |
| DB 인덱스 / 퍼포먼스 | ✅ |
