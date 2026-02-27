-- Ensure realtime NOTIFY also fires when message text is updated in-place.
-- This covers pipelines that insert a row first, then update outbound/inbound text.

DROP TRIGGER IF EXISTS trg_chat_audit_logs_notify_insert ON chat_audit_logs;
DROP TRIGGER IF EXISTS trg_chat_audit_logs_notify_update ON chat_audit_logs;

CREATE TRIGGER trg_chat_audit_logs_notify_insert
AFTER INSERT ON chat_audit_logs
FOR EACH ROW
EXECUTE FUNCTION notify_chat_audit_logs_insert();

CREATE TRIGGER trg_chat_audit_logs_notify_update
AFTER UPDATE OF user_phone, session_id, channel, inbound_text, outbound_text ON chat_audit_logs
FOR EACH ROW
WHEN (
  OLD.user_phone IS DISTINCT FROM NEW.user_phone
  OR OLD.session_id IS DISTINCT FROM NEW.session_id
  OR OLD.channel IS DISTINCT FROM NEW.channel
  OR OLD.inbound_text IS DISTINCT FROM NEW.inbound_text
  OR OLD.outbound_text IS DISTINCT FROM NEW.outbound_text
)
EXECUTE FUNCTION notify_chat_audit_logs_insert();
