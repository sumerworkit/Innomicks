# Meeting Cost Calculator

Simple Express + MongoDB app for the Bulld Task.

## Run

```bash
npm install
npm start
```

Open `http://localhost:3000`.

## MongoDB

By default the app uses:

```text
mongodb://127.0.0.1:27017/meeting_cost_calculator
```

To use another database, copy `.env.example` to `.env` and change `MONGODB_URI`.

## Completed

- Part A: Add/remove people, enter meeting length, live total cost.
- Part B: One-line agenda recommendation using cost, attendee count, length, and agenda wording.
- Part C: Save meetings, show all past meetings from MongoDB, and edit saved meetings.
