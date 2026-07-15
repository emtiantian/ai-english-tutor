ALTER TABLE sessions ADD COLUMN style_name TEXT;
ALTER TABLE sessions ADD COLUMN voice_design TEXT;
ALTER TABLE sessions ADD COLUMN scenario_state TEXT;
ALTER TABLE user_vocabulary ADD COLUMN context_count INTEGER DEFAULT 0;
ALTER TABLE user_vocabulary ADD COLUMN contexts TEXT DEFAULT '[]';
ALTER TABLE user_vocabulary ADD COLUMN consecutive_incorrect INTEGER DEFAULT 0;
ALTER TABLE conversation_history ADD COLUMN vocabulary_sentences TEXT;
ALTER TABLE user_vocabulary ADD COLUMN updated_at INTEGER DEFAULT (unixepoch());
