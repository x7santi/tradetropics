-- Checklist items: per-user pre-trade checklist stored in Supabase
CREATE TABLE IF NOT EXISTS checklist_items (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  text       text        NOT NULL,
  checked    boolean     NOT NULL DEFAULT false,
  position   integer     NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE checklist_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users own their checklist"
  ON checklist_items
  FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS checklist_items_user_id_idx ON checklist_items (user_id, position);
