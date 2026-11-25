CREATE INDEX "account_changes_roster_revision" ON "account_changes" USING btree ("connection_id") WHERE
  ((action = 'invite' and status = 'succeeded' and source_key is not null)
  or (action = 'remove' and status in ('succeeded', 'done_by_hand')))
;