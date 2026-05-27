# RFC · Payment Gateway Module

## 1. Context

We need to add a payment gateway to handle subscription billing.

## 2. Decisions

### 2.1 Datastore

Decisión: usar PostgreSQL para almacenar las transacciones.

ADR-001: Payments persistence model.

### 2.2 Communication protocol

Decisión: REST sobre HTTPS para integrar con el procesador de pagos.

ADR-005: API protocol selection.

### 2.3 Schema

`transactions` table:
- `id` UUID
- `amount` DECIMAL
- `currency` VARCHAR(3)
- `status` ENUM
- `created_at` TIMESTAMP

## 3. Validation flow

1. Cliente envía `POST /charge` con `amount`, `currency`, `card_token`.
2. Backend valida con el procesador.
3. Insertamos en `transactions` con `status=processed` y el `customer_id`.

## 4. Performance

El sistema será rápido y escalable.

## 4. Security

Usamos HTTPS y validamos input.

## 5. Open questions

(none)
