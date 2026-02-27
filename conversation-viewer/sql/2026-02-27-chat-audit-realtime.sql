-- Realtime notifications for chat_audit_logs inserts
CREATE OR REPLACE FUNCTION notify_chat_audit_logs_insert()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  payload text;
BEGIN
  payload := json_build_object(
    'id', NEW.id,
    'userPhone', NEW.user_phone,
    'sessionId', NEW.session_id,
    'channel', NEW.channel,
    'createdAt', to_char(NEW.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  )::text;

  PERFORM pg_notify('chat_audit_logs_insert', payload);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_chat_audit_logs_notify_insert ON chat_audit_logs;

CREATE TRIGGER trg_chat_audit_logs_notify_insert
AFTER INSERT ON chat_audit_logs
FOR EACH ROW
EXECUTE FUNCTION notify_chat_audit_logs_insert();

-- Performance indexes for delta/session reads
CREATE INDEX IF NOT EXISTS idx_chat_audit_logs_user_session_id
  ON chat_audit_logs (user_phone, session_id, id);

CREATE INDEX IF NOT EXISTS idx_chat_audit_logs_user_unscoped_id
  ON chat_audit_logs (user_phone, id)
  WHERE session_id IS NULL OR session_id = '';
