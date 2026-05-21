/**
 * Polymarket CLOB OrderResponse (POST /order, createAndPostOrder).
 * @see https://docs.polymarket.com/trading/clients/l2#createandpostorder
 * @see https://docs.polymarket.com/trading/orders/overview#error-messages
 */
export interface PolymarketOrderResponse {
  success: boolean;
  errorMsg?: string;
  orderID?: string;
  status?: string;
  transactionsHashes?: string[];
  takingAmount?: string;
  makingAmount?: string;
}

/** Insert statuses returned when placement succeeds. */
export const POLYMARKET_ORDER_INSERT_STATUSES = [
  'matched',
  'live',
  'delayed',
  'unmatched',
] as const;

export type PostOrderResult =
  | { ok: true; orderId: string; status?: string }
  | { ok: false; reason: string };

function isOrderResponse(value: unknown): value is PolymarketOrderResponse {
  return (
    value != null &&
    typeof value === 'object' &&
    typeof (value as PolymarketOrderResponse).success === 'boolean'
  );
}

/** CLOB HTTP error body: { error: string, status: number } */
function getClobApiErrorMessage(response: unknown): string | null {
  if (response == null || typeof response !== 'object') return null;
  const body = response as { error?: unknown; errorMsg?: unknown };
  if (typeof body.error === 'string' && body.error.length > 0)
    return body.error;
  if (typeof body.errorMsg === 'string' && body.errorMsg.length > 0)
    return body.errorMsg;
  return null;
}

/**
 * Parses createAndPostOrder / postOrder response per official docs:
 * - success === true → order placed (check orderID)
 * - success === false → use errorMsg (INVALID_ORDER_*, etc.)
 */
export function parsePolymarketPostOrderResponse(
  response: unknown,
): PostOrderResult {
  if (!isOrderResponse(response)) {
    const apiError = getClobApiErrorMessage(response);
    return {
      ok: false,
      reason: apiError ?? 'Invalid order response: missing success field',
    };
  }

  if (response.success !== true) {
    const reason =
      typeof response.errorMsg === 'string' && response.errorMsg.length > 0
        ? response.errorMsg
        : 'Order rejected (success=false)';
    return { ok: false, reason };
  }

  const orderId =
    typeof response.orderID === 'string' && response.orderID.length > 0
      ? response.orderID
      : null;
  if (!orderId) {
    return {
      ok: false,
      reason: 'Order accepted (success=true) but missing orderID in response',
    };
  }

  const status =
    typeof response.status === 'string' && response.status.length > 0
      ? response.status
      : undefined;

  return { ok: true, orderId, status };
}
