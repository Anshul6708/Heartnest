# Relationship Manager - AI Therapy Assistant

An AI-powered relationship conflict resolution tool for couples, built with Next.js and Claude AI.

## Features

- **Secure Session Creation**: Partners can create unique therapy sessions with shareable links
- **Partner Identification**: Each user selects their name to chat individually with the AI
- **AI-Mediated Conversations**: Claude AI acts as a compassionate therapist to understand each partner's perspective
- **Automatic Summarization**: AI generates summaries of each partner's perspective
- **Solution Generation**: Once both partners have shared their views, AI provides a balanced resolution
- **Anonymous & Private**: No user accounts required, sessions are temporary and secure

## User Flow

1. **Landing Page**: First partner enters both names and creates a therapy session
2. **Partner Selection**: Users click on their name to start chatting
3. **Individual Chats**: Each partner chats with AI separately to share their perspective
4. **Summary Generation**: AI creates a summary after sufficient conversation (3-4 exchanges)
5. **Cross-Sharing**: Second partner sees the first partner's summary before starting their chat
6. **Solution Delivery**: Once both summaries exist, AI provides a final mediated solution

## Tech Stack

- **Frontend**: Next.js 15, React 19, TypeScript
- **Styling**: Tailwind CSS with dark theme support
- **AI**: GPT-4 via OpenAI API
- **Database**: Supabase (PostgreSQL)
- **UI Components**: Radix UI primitives
- **Icons**: Heroicons

## Database Schema

### chat_sessions
- `id`: UUID (Primary key)
- `user_id`: TEXT (Anonymous identifier)
- `created_at`: TIMESTAMP
- `has_summary`: BOOLEAN
- `summary`: TEXT
- `session_type`: 'PILOT' | 'THERAPY'
- `partner_names`: TEXT (e.g., "Alice & Bob")

### chat_messages
- `id`: UUID (Primary key)
- `session_id`: UUID (Foreign key)
- `role`: 'user' | 'assistant'
- `message`: TEXT
- `name`: TEXT (Partner identifier)
- `created_at`: TIMESTAMP
- `metadata`: JSONB

### summaries
- `id`: UUID (Primary key)
- `session_id`: UUID (Foreign key)
- `partner_name`: TEXT
- `summary_text`: TEXT
- `created_at`: TIMESTAMP

## Environment Variables

Create a `.env.local` file with:

```env
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url_here
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key_here

# OpenAI API Key
OPENAI_API_KEY=your_openai_api_key_here

# App Configuration
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

## Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd relationship-manager
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up Supabase**
   - Create a new Supabase project
   - Run the migration in `supabase/migrations/20241201_add_therapy_features.sql`
   - Copy your project URL and anon key to `.env.local`

4. **Set up OpenAI API**
   - Get an API key from [OpenAI](https://platform.openai.com/api-keys)
   - Add it to `.env.local`

5. **Run the development server**
   ```bash
   npm run dev
   ```

6. **Open your browser**
   Navigate to `http://localhost:3000`

## API Endpoints

### POST `/api/therapist/create-session`
Creates a new therapy session with partner names.

**Body:**
```json
{
  "partnerNames": "Alice & Bob"
}
```

**Response:**
```json
{
  "sessionId": "uuid",
  "partnerNames": "Alice & Bob"
}
```

### POST `/api/therapist/chat`
Handles chat interactions, summary generation, and solution creation.

**Body:**
```json
{
  "sessionId": "uuid",
  "partnerName": "Alice",
  "message": "User message",
  "messages": [...]
}
```

**Response:**
```json
{
  "message": "AI response",
  "summary": "Generated summary (optional)",
  "solution": "Final solution (optional)"
}
```

## Project Structure

```
relationship-manager/
├── app/
│   ├── api/therapist/          # API routes
│   ├── therapist/              # Main app pages
│   ├── globals.css             # Global styles
│   ├── layout.tsx              # Root layout
│   └── page.tsx                # Home redirect
├── components/ui/              # Reusable UI components
├── hooks/                      # React hooks
├── lib/                        # Utility functions and services
├── package.json
├── tailwind.config.ts
└── tsconfig.json
```

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Support

For support, please open an issue on GitHub or contact the development team. 