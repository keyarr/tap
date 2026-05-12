#!/usr/bin/env bash
# Webhook Inspector Demo Script
# Sends 3 sample webhook payloads for testing
# Usage: bash demo.sh [hook_uuid] [base_url]

set -e

BASE="${2:-http://localhost:8000}"
UUID="${1}"

if [ -z "$UUID" ]; then
  echo "Creating new webhook endpoint..."
  RESP=$(curl -s -X POST "$BASE/hooks/new")
  UUID=$(echo "$RESP" | grep -o '"hook_uuid":"[^"]*"' | cut -d'"' -f4)
  echo "Endpoint: $BASE/hooks/$UUID"
  echo
fi

ENDPOINT="$BASE/hooks/$UUID"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Demo: Sending 3 webhook payloads"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo

# 1) Stripe-style checkout event
echo "➤ Payload 1: Stripe checkout.session.completed"
curl -s -X POST "$ENDPOINT" \
  -H "Content-Type: application/json" \
  -H "User-Agent: Stripe/1.0" \
  -H "Stripe-Signature: t=1234567890,v1=fake_signature" \
  -d '{
    "id": "evt_1QpY3kLkdIwFn7eR3kX9aB5c",
    "type": "checkout.session.completed",
    "data": {
      "object": {
        "id": "cs_test_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6",
        "amount_total": 2999,
        "currency": "usd",
        "customer_email": "customer@example.com",
        "payment_status": "paid",
        "metadata": {
          "order_id": "ORD-2024-1234"
        }
      }
    }
  }' | python3 -m json.tool 2>/dev/null || cat
echo

sleep 0.5

# 2) Shopify order creation
echo "➤ Payload 2: Shopify orders/create"
curl -s -X POST "$ENDPOINT" \
  -H "Content-Type: application/json" \
  -H "User-Agent: Shopify/1.0" \
  -H "X-Shopify-Shop-Domain: my-store.myshopify.com" \
  -H "X-Shopify-Hmac-Sha256: fake_hmac_value" \
  -d '{
    "id": 9876543210,
    "email": "john@example.com",
    "created_at": "2026-05-10T10:30:00Z",
    "total_price": "59.98",
    "subtotal_price": "49.99",
    "currency": "USD",
    "financial_status": "paid",
    "fulfillment_status": null,
    "line_items": [
      {
        "id": 111,
        "title": "T-Shirt",
        "quantity": 2,
        "price": "24.99"
      }
    ],
    "shipping_address": {
      "first_name": "John",
      "last_name": "Doe",
      "city": "Portland",
      "country": "US"
    }
  }' | python3 -m json.tool 2>/dev/null || cat
echo

sleep 0.5

# 3) GitHub push event
echo "➤ Payload 3: GitHub push event"
curl -s -X POST "$ENDPOINT" \
  -H "Content-Type: application/json" \
  -H "User-Agent: GitHub-Hookshot/abc123" \
  -H "X-GitHub-Event: push" \
  -H "X-Hub-Signature-256: sha256=fake_github_signature" \
  -d '{
    "ref": "refs/heads/main",
    "repository": {
      "full_name": "user/webhook-inspector",
      "html_url": "https://github.com/user/webhook-inspector"
    },
    "pusher": {
      "name": "developer",
      "email": "dev@example.com"
    },
    "commits": [
      {
        "id": "abc123def456",
        "message": "Add webhook inspector feature",
        "timestamp": "2026-05-10T11:00:00Z",
        "author": {
          "name": "Developer",
          "email": "dev@example.com"
        }
      }
    ],
    "forced": false
  }' | python3 -m json.tool 2>/dev/null || cat
echo

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Done! 3 payloads sent to $ENDPOINT"
echo "  Check the Webhook Inspector UI (http://localhost:5173)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
