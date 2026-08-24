# Room Booking GraphQL API

A production-ready, concurrency-safe GraphQL API backend built with **Bun**, **TypeScript** (strict mode), **GraphQL Yoga** (schema-first), **Prisma ORM**, and **PostgreSQL**.

---

## Key Features

- **Schema-First Design**: Pure `.graphql` schema defining all types, queries, inputs, and mutations.
- **Half-Open Time Interval Handling**: Booking slots operate on `[startTime, endTime)` intervals, supporting exact back-to-back bookings (e.g. 10:00–11:00 and 11:00–12:00).
- **Concurrency Safety**: Double protection using application-level transactions and **PostgreSQL GiST Exclusion Constraints** (`EXCLUDE USING gist`) on `(resource_id WITH =, tsrange(start_time, end_time, '[)') WITH &&) WHERE (status = 'CONFIRMED')`.
- **Cancelled Booking Reuse**: Cancelled bookings immediately free up the time slot.
- **Reschedule Verification**: Rescheduling checks conflicts across all other bookings while excluding the current booking being edited.
- **Cursor-Based Pagination**: Paginated booking lists ordered by `startTime` ASC with base64 encoded cursors and total record counts.
- **DB-Backed Test Suite**: Fully automated tests using `bun test` covering all required concurrency and overlap edge cases.

---

## Tech Stack & Architecture

- **Runtime**: [Bun](https://bun.sh) (v1.4+)
- **Language**: TypeScript (strict mode enabled)
- **GraphQL Server**: [GraphQL Yoga](https://the-guild.dev/graphql/yoga-server) v5
- **ORM**: [Prisma](https://www.prisma.io/) v5
- **Database**: PostgreSQL 16 (with `btree_gist` extension enabled)

---

## Getting Started

### Prerequisites
- [Bun](https://bun.sh) installed (`curl -fsSL https://bun.com/install | bash`)
- [PostgreSQL](https://www.postgresql.org/) running locally or via Docker (`docker compose up -d`)

### 1. Clone & Install Dependencies
```bash
git clone <repository-url>
cd room-booking-api
bun install
```

### 2. Configure Environment Variables
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
Ensure your `DATABASE_URL` points to your PostgreSQL instance:
```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/roombooking?schema=public"
PORT=4000
```

### 3. Run Database Migrations
Apply Prisma migrations (which enables `btree_gist` extension and the Exclusion Constraint):
```bash
npx prisma migrate dev
```

### 4. Run the API Server
Start the development server:
```bash
bun run dev
```
Open [http://localhost:4000/graphql](http://localhost:4000/graphql) in your browser to access GraphiQL IDE.

---

## Running Automated DB-Backed Tests

Execute all database-backed integration tests using Bun's native test runner:
```bash
bun test
```

### Test Coverage Checklist:
- [x] Normal booking creation
- [x] Overlapping booking rejection
- [x] Exact back-to-back booking support
- [x] Cancelled booking non-blocking availability
- [x] Rescheduling conflict detection
- [x] Rescheduling non-conflict with self
- [x] Concurrent booking race conditions (ensures only 1 succeeds out of simultaneous requests)
- [x] Cursor-based pagination

---

## GraphQL API Overview

### Queries
```graphql
# List all resources
query {
  resources {
    id
    name
    capacity
  }
}

# Fetch paginated bookings
query GetBookings($resourceId: ID, $first: Int, $after: String) {
  bookings(resourceId: $resourceId, first: $first, after: $after) {
    totalCount
    edges {
      cursor
      node {
        id
        title
        startTime
        endTime
        status
      }
    }
    pageInfo {
      hasNextPage
      hasPreviousPage
      endCursor
    }
  }
}

# Check resource availability
query CheckSlot($resourceId: ID!, $startTime: String!, $endTime: String!) {
  checkAvailability(resourceId: $resourceId, startTime: $startTime, endTime: $endTime) {
    available
    reason
    conflictingBooking {
      id
      title
    }
  }
}
```

### Mutations
```graphql
# Create Resource
mutation {
  createResource(input: { name: "Boardroom A", capacity: 12 }) {
    id
    name
  }
}

# Create Booking
mutation {
  createBooking(input: {
    resourceId: "RESOURCE_ID",
    title: "Quarterly Planning",
    startTime: "2026-09-01T10:00:00Z",
    endTime: "2026-09-01T11:00:00Z"
  }) {
    id
    status
  }
}

# Reschedule Booking
mutation {
  rescheduleBooking(
    id: "BOOKING_ID",
    startTime: "2026-09-01T11:30:00Z",
    endTime: "2026-09-01T12:30:00Z"
  ) {
    id
    startTime
    endTime
  }
}

# Cancel Booking
mutation {
  cancelBooking(id: "BOOKING_ID") {
    id
    status
  }
}
```

---

## Technical Decisions & Concurrency Strategy

### 1. Half-Open Interval `[startTime, endTime)`
Booking conflicts occur when `existing.startTime < new.endTime` AND `existing.endTime > new.startTime`. This logic naturally permits back-to-back slots (where `slot1.endTime == slot2.startTime`).

### 2. Concurrency Control with Exclusion Constraints
To prevent race conditions when multiple client requests arrive simultaneously, we utilize PostgreSQL's `EXCLUDE USING gist`:
```sql
ALTER TABLE "bookings" ADD CONSTRAINT "no_overlapping_confirmed_bookings"
EXCLUDE USING gist (
    resource_id WITH =,
    tsrange(start_time, end_time, '[)') WITH &&
) WHERE (status = 'CONFIRMED');
```
This guarantees transactional non-overlapping enforcement inside PostgreSQL itself, failing any concurrent overlapping insert/update atomically.
