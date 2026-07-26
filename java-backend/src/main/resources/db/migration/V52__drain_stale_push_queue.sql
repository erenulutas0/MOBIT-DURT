-- Kills the push backlog that was buzzing the phone about alerts already read in the app.
--
-- The outbox sent whatever it was handed, however old and whatever had happened since, so a queue
-- that built up while delivery was failing kept re-arriving long after the user had cleared the
-- list. MobilePushOutboxService now refuses to deliver a read or stale notification, but it works
-- through 50 rows a tick — this retires the existing backlog in one step so the phone goes quiet
-- immediately rather than over the next several minutes.
UPDATE erp_mobile_push_outbox queued
   SET status = 'DEAD',
       last_error = 'Retired: already read or too old to be worth delivering',
       updated_at = NOW()
 WHERE queued.status IN ('PENDING', 'RETRY')
   AND EXISTS (
       SELECT 1
         FROM erp_notifications notification
        WHERE notification.id = queued.notification_id
          AND (notification.read_at IS NOT NULL
               OR notification.created_at < NOW() - INTERVAL '2 hours'));
