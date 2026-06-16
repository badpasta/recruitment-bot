# Mail Infrastructure: SMTP/IMAP Design

## Architecture

Two independent classes under `src/mail/`, each accepting a typed config object at construction time.

```
src/mail/
  sender.ts       — EmailSender wraps nodemailer Transporter
  receiver.ts     — EmailReceiver wraps imapflow + mailparser
  types.ts        — shared config and result types

tests/mail/
  sender.test.ts
  receiver.test.ts
```

## EmailSender

- **Depends on**: nodemailer
- **Config**: `SmtpConfig { host, port, user, pass, secure?, logger? }`
- **API**: `send(options) → Promise<SentInfo>`, `verify() → Promise<boolean>`
- **SendOptions**: `{ to, subject, html?, text?, attachments? }`
- Transporter created once in constructor, reused across sends

## EmailReceiver

- **Depends on**: imapflow, mailparser
- **Config**: `ImapConfig { host, port, user, pass, tls?, logger? }`
- **API**: `connect()`, `disconnect()`, `fetchLatest(n) → Promise<ParsedEmail[]>`, `fetchSince(date) → Promise<ParsedEmail[]>`
- Connection managed explicitly by caller
- Each fetched message parsed through mailparser

## ParsedEmail

```ts
{ messageId, from, to, subject, date, text?, html?, attachments[] }
```

## Config injection

Env vars read at call site (e.g. `src/index.ts`), not inside the module:

| Var | Used for |
|-----|----------|
| SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_SECURE | EmailSender |
| IMAP_HOST, IMAP_PORT, IMAP_USER, IMAP_PASS, IMAP_TLS | EmailReceiver |

## Testing strategy

- Unit tests mock nodemailer's `createTransport` and imapflow's `ImapFlow`
- Verify config is passed through
- Verify send/receive call counts and parameters
- Verify mailparser output shape
- No real SMTP/IMAP servers needed
