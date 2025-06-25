-- Add new columns to chat_sessions table for therapy functionality
ALTER TABLE chat_sessions 
ADD COLUMN session_type TEXT DEFAULT 'PILOT' CHECK (session_type IN ('PILOT', 'THERAPY')),
ADD COLUMN partner_names TEXT;

-- Add name column to chat_messages table for partner identification
ALTER TABLE chat_messages 
ADD COLUMN name TEXT;

-- Create summaries table to store partner summaries
CREATE TABLE summaries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
    partner_name TEXT NOT NULL,
    summary_text TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Create indexes for better query performance
CREATE INDEX idx_summaries_session_id ON summaries(session_id);
CREATE INDEX idx_summaries_partner_name ON summaries(partner_name);
CREATE INDEX idx_chat_messages_name ON chat_messages(name);

-- Enable Row Level Security (RLS) for summaries table
ALTER TABLE summaries ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for anonymous access to summaries
CREATE POLICY "Allow anonymous access to summaries"
    ON summaries FOR ALL
    TO anon
    USING (true)
    WITH CHECK (true); 