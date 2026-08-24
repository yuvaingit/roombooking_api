# Room Booking GraphQL API — Implementation Walkthrough

## 1. Overview

This project is a **Room Booking GraphQL API** designed to manage rooms/resources and their bookings while correctly handling availability, overlapping bookings, cancellations, rescheduling, pagination, and concurrent booking requests.

The API is built using:

* **Bun** — JavaScript/TypeScript runtime
* **TypeScript** — strict type-safe application development
* **GraphQL Yoga** — GraphQL server
* **GraphQL schema-first design** — API contract defined using `.graphql`
* **Prisma ORM** — database access and type safety
* **PostgreSQL** — relational database
* **PostgreSQL GiST exclusion constraints** — database-level protection against overlapping confirmed bookings
* **Bun Test** — database-backed integration testing

The primary design goal was to ensure that booking conflicts are handled correctly not only during normal requests, but also when multiple requests attempt to book the same resource concurrently.

---

## 2. Architecture

The application follows a straightforward layered architecture:

```text
Client / GraphiQL
       │
       ▼
GraphQL Yoga
       │
       ▼
GraphQL Schema
       │
       ▼
Resolvers / Application Logic
       │
       ▼
Prisma ORM
       │
       ▼
PostgreSQL
```

The GraphQL schema defines the available queries, mutations, types, and inputs.

GraphQL Yoga receives requests and routes them to the appropriate resolvers. The resolvers contain the application-level booking and validation logic, while Prisma provides typed database access.

PostgreSQL acts as the source of truth for persistent booking data and additionally enforces the critical non-overlapping booking constraint at the database level.

---

## 3. GraphQL API Design

I used a **schema-first approach**, where the GraphQL schema explicitly defines the API contract.

### Queries

The API supports:

* `resources` — retrieve available rooms/resources
* `bookings` — retrieve bookings, including cursor-based pagination
* `checkAvailability` — check whether a resource is available for a requested time range

For example:

```graphql
query CheckSlot(
  $resourceId: ID!
  $startTime: String!
  $endTime: String!
) {
  checkAvailability(
    resourceId: $resourceId
    startTime: $startTime
    endTime: $endTime
  ) {
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

The API supports:

* `createResource`
* `createBooking`
* `rescheduleBooking`
* `cancelBooking`

This provides the complete lifecycle for a booking: creating a resource, creating a booking, modifying its schedule, and cancelling it.

---

## 4. Booking Flow

The main booking flow is:

```text
Create Resource
      │
      ▼
Create Booking Request
      │
      ▼
Validate Time Range
      │
      ▼
Check Existing Bookings
      │
      ▼
Application-Level Validation
      │
      ▼
Database Transaction
      │
      ▼
PostgreSQL Constraint
      │
      ▼
Booking Created / Conflict Rejected
```

For example, a booking can be created using:

```graphql
mutation {
  createBooking(input: {
    resourceId: "RESOURCE_ID"
    title: "Quarterly Planning"
    startTime: "2026-09-01T10:00:00Z"
    endTime: "2026-09-01T11:00:00Z"
  }) {
    id
    status
  }
}
```

If another confirmed booking already occupies an overlapping period for the same resource, the request is rejected.

---

## 5. Half-Open Time Intervals

One important design decision was representing booking intervals as:

```text
[startTime, endTime)
```

This means the start time is inclusive while the end time is exclusive.

For example:

```text
Booking A: 10:00 ───── 11:00
Booking B:              11:00 ───── 12:00
```

These bookings do **not** overlap and are therefore both valid.

The overlap condition is effectively:

```text
existing.startTime < new.endTime
AND
existing.endTime > new.startTime
```

This avoids unnecessarily blocking exact back-to-back bookings.

For example:

* `10:00–11:00` + `10:30–11:30` → conflict
* `10:00–11:00` + `11:00–12:00` → allowed

This representation also maps directly to PostgreSQL's `tsrange` range type.

---

## 6. Concurrency Safety

The most important technical decision in the implementation is that booking conflict prevention is protected at **both the application and database levels**.

A simple application-level availability check is not sufficient by itself.

For example, if two requests arrive at almost exactly the same time:

```text
Request A ──► Check availability ──► Available
Request B ──► Check availability ──► Available

Request A ──► Create booking
Request B ──► Create booking
```

Both requests could potentially pass the availability check before either booking is committed.

To prevent this race condition, PostgreSQL is configured with a **GiST exclusion constraint**:

```sql
EXCLUDE USING gist (
    resource_id WITH =,
    tsrange(start_time, end_time, '[)') WITH &&
)
WHERE (status = 'CONFIRMED');
```

This constraint ensures that two confirmed bookings cannot overlap for the same resource.

The database therefore becomes the final enforcement layer for the booking invariant.

The implementation combines:

1. Application-level validation
2. Transactional database operations
3. PostgreSQL exclusion constraints

This provides protection for both normal requests and concurrent booking attempts.

---

## 7. Cancelled Bookings

Cancelled bookings should not continue blocking a resource's schedule.

The PostgreSQL exclusion constraint is therefore applied only when:

```text
status = CONFIRMED
```

A cancelled booking no longer participates in the overlap constraint, allowing another booking to use the same time slot.

This also means cancellation immediately makes the corresponding time range reusable.

---

## 8. Rescheduling

The API also supports rescheduling an existing booking.

For example:

```graphql
mutation {
  rescheduleBooking(
    id: "BOOKING_ID"
    startTime: "2026-09-01T11:30:00Z"
    endTime: "2026-09-01T12:30:00Z"
  ) {
    id
    startTime
    endTime
  }
}
```

During rescheduling, the conflict check considers other bookings while excluding the booking currently being modified.

This prevents a booking from incorrectly conflicting with itself while still detecting conflicts with other confirmed bookings.

---

## 9. Cursor-Based Pagination

The `bookings` query supports cursor-based pagination.

The response includes:

* `totalCount`
* `edges`
* `cursor`
* `node`
* `pageInfo`
* `hasNextPage`
* `hasPreviousPage`
* `endCursor`

Example:

```graphql
query GetBookings(
  $resourceId: ID
  $first: Int
  $after: String
) {
  bookings(
    resourceId: $resourceId
    first: $first
    after: $after
  ) {
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
```

The bookings are ordered by `startTime` ascending, and cursors are encoded using base64.

This allows the API to handle larger booking lists without requiring clients to retrieve every record at once.

---

## 10. Testing

The project includes a **database-backed integration test suite** using Bun's native test runner.

Tests cover the important booking scenarios:

* Normal booking creation
* Overlapping booking rejection
* Exact back-to-back booking support
* Cancelled booking reuse
* Rescheduling conflict detection
* Rescheduling without conflicting with itself
* Concurrent booking race conditions
* Cursor-based pagination

The test suite can be executed with:

```bash
bun test
```

The concurrency test is particularly important because it verifies that simultaneous booking attempts cannot both successfully reserve the same overlapping time range.

---

## 11. Deployment

The application is also configured for deployment using Vercel.

The repository includes:

* `vercel.json`
* A serverless function entry point
* Prisma configuration for the deployment environment
* Prisma binary targets required by the deployment environment

The project also includes a Docker Compose configuration for running PostgreSQL locally.

The deployed GraphQL API is available at:

**https://roombookingapi.vercel.app/**

The GraphQL endpoint is exposed through the deployed application.

---

## 12. Key Design Decisions

### GraphQL instead of REST

GraphQL provides a strongly typed API contract and allows clients to request only the fields they need.

### Prisma ORM

Prisma provides type-safe database access and keeps the application code strongly aligned with the PostgreSQL schema.

### PostgreSQL

A relational database is appropriate for this system because resources and bookings have clear relationships and the booking system requires reliable transactional behavior.

### Half-open intervals

Using `[startTime, endTime)` makes exact back-to-back bookings possible while keeping overlap detection straightforward.

### Database-level exclusion constraint

The database constraint provides a final guarantee against overlapping confirmed bookings, including concurrent requests that could bypass application-level checks.

### Cursor-based pagination

Cursor pagination provides a scalable way to retrieve booking lists while maintaining stable ordering.

---

## 13. Project Structure

The main repository structure is:

```text
roombooking_api/
├── api/
├── prisma/
├── src/
├── tests/
├── .env.example
├── .gitignore
├── bun.lock
├── docker-compose.yml
├── package.json
├── tsconfig.json
├── vercel.json
└── README.md
```

The separation of API, application source, database configuration, and tests keeps the project organized and makes the individual responsibilities easier to maintain.

---

## 14. Running the Project

The project can be run locally with Bun and PostgreSQL.

Install dependencies:

```bash
bun install
```

Create the environment file:

```bash
cp .env.example .env
```

Start PostgreSQL using Docker if required:

```bash
docker compose up -d
```

Apply the Prisma migrations:

```bash
npx prisma migrate dev
```

Start the development server:

```bash
bun run dev
```

The GraphiQL interface is then available at:

```text
http://localhost:4000/graphql
```

Automated tests can be run using:

```bash
bun test
```

---

## 15. Summary

The main focus of this implementation was to build more than a basic CRUD API.

The API provides:

* A schema-first GraphQL interface
* Resource and booking management
* Availability checking
* Overlap detection
* Back-to-back booking support
* Booking cancellation
* Booking rescheduling
* Cursor-based pagination
* Database-backed integration tests
* Protection against concurrent booking conflicts

The key reliability decision was enforcing booking conflicts at the PostgreSQL level using a GiST exclusion constraint in addition to application-level validation.

This ensures that the core business rule — **a resource cannot have two overlapping confirmed bookings** — remains enforced even when multiple requests are processed concurrently.
