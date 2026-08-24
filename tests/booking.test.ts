import { describe, it, expect, beforeEach, afterAll } from "bun:test";
import { yoga } from "../src/server";
import prisma from "../src/db";

async function gql(query: string, variables?: Record<string, any>) {
  const res = await yoga.fetch("http://localhost:4000/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  return await res.json();
}

describe("Room Booking GraphQL API - Database Backed Integration Tests", () => {
  beforeEach(async () => {
    await prisma.booking.deleteMany();
    await prisma.resource.deleteMany();
  });

  afterAll(async () => {
    await prisma.booking.deleteMany();
    await prisma.resource.deleteMany();
    await prisma.$disconnect();
  });

  it("1. Normal booking - successfully creates a booking for an available time slot", async () => {
    // Create resource
    const resMut = await gql(`
      mutation {
        createResource(input: { name: "Conference Room A", capacity: 10 }) {
          id
          name
          capacity
        }
      }
    `);
    expect(resMut.errors).toBeUndefined();
    const resourceId = resMut.data.createResource.id;

    // Create booking
    const bookingMut = await gql(`
      mutation CreateB($input: CreateBookingInput!) {
        createBooking(input: $input) {
          id
          title
          startTime
          endTime
          status
          resource {
            id
            name
          }
        }
      }
    `, {
      input: {
        resourceId,
        title: "Sprint Planning",
        startTime: "2026-09-01T10:00:00Z",
        endTime: "2026-09-01T11:00:00Z",
      },
    });

    expect(bookingMut.errors).toBeUndefined();
    expect(bookingMut.data.createBooking.title).toBe("Sprint Planning");
    expect(bookingMut.data.createBooking.status).toBe("CONFIRMED");
    expect(bookingMut.data.createBooking.resource.name).toBe("Conference Room A");
  });

  it("2. Overlapping booking - rejects booking when time slots overlap", async () => {
    const resMut = await gql(`
      mutation {
        createResource(input: { name: "Meeting Room 1", capacity: 6 }) {
          id
        }
      }
    `);
    const resourceId = resMut.data.createResource.id;

    // Initial booking: 10:00 - 11:00
    await gql(`
      mutation CreateB($input: CreateBookingInput!) {
        createBooking(input: $input) { id }
      }
    `, {
      input: {
        resourceId,
        title: "Existing Meeting",
        startTime: "2026-09-01T10:00:00Z",
        endTime: "2026-09-01T11:00:00Z",
      },
    });

    // Overlapping booking: 10:30 - 11:30
    const overlapRes = await gql(`
      mutation CreateB($input: CreateBookingInput!) {
        createBooking(input: $input) { id }
      }
    `, {
      input: {
        resourceId,
        title: "Conflicting Meeting",
        startTime: "2026-09-01T10:30:00Z",
        endTime: "2026-09-01T11:30:00Z",
      },
    });

    expect(overlapRes.errors).toBeDefined();
    expect(overlapRes.errors[0].message).toContain("conflict");
  });

  it("3. Exact back-to-back booking - allows bookings where end time equals start time", async () => {
    const resMut = await gql(`
      mutation {
        createResource(input: { name: "Focus Pod B", capacity: 2 }) { id }
      }
    `);
    const resourceId = resMut.data.createResource.id;

    // Slot 1: 10:00 - 11:00
    const b1 = await gql(`
      mutation CreateB($input: CreateBookingInput!) {
        createBooking(input: $input) { id status }
      }
    `, {
      input: {
        resourceId,
        title: "Slot 1",
        startTime: "2026-09-01T10:00:00Z",
        endTime: "2026-09-01T11:00:00Z",
      },
    });
    expect(b1.errors).toBeUndefined();

    // Slot 2: 11:00 - 12:00 (back-to-back)
    const b2 = await gql(`
      mutation CreateB($input: CreateBookingInput!) {
        createBooking(input: $input) { id status }
      }
    `, {
      input: {
        resourceId,
        title: "Slot 2",
        startTime: "2026-09-01T11:00:00Z",
        endTime: "2026-09-01T12:00:00Z",
      },
    });
    expect(b2.errors).toBeUndefined();
    expect(b2.data.createBooking.status).toBe("CONFIRMED");

    // Slot 0: 09:00 - 10:00 (preceding back-to-back)
    const b0 = await gql(`
      mutation CreateB($input: CreateBookingInput!) {
        createBooking(input: $input) { id status }
      }
    `, {
      input: {
        resourceId,
        title: "Slot 0",
        startTime: "2026-09-01T09:00:00Z",
        endTime: "2026-09-01T10:00:00Z",
      },
    });
    expect(b0.errors).toBeUndefined();
    expect(b0.data.createBooking.status).toBe("CONFIRMED");
  });

  it("4. Cancelled booking doesn't block - allows reuse of cancelled time slots", async () => {
    const resMut = await gql(`
      mutation {
        createResource(input: { name: "Boardroom", capacity: 12 }) { id }
      }
    `);
    const resourceId = resMut.data.createResource.id;

    // Create booking: 10:00 - 11:00
    const b1 = await gql(`
      mutation CreateB($input: CreateBookingInput!) {
        createBooking(input: $input) { id }
      }
    `, {
      input: {
        resourceId,
        title: "Initial Booking",
        startTime: "2026-09-01T10:00:00Z",
        endTime: "2026-09-01T11:00:00Z",
      },
    });

    const bookingId = b1.data.createBooking.id;

    // Cancel booking
    const cancelRes = await gql(`
      mutation CancelB($id: ID!) {
        cancelBooking(id: $id) { id status }
      }
    `, { id: bookingId });
    expect(cancelRes.data.cancelBooking.status).toBe("CANCELLED");

    // Book the same slot again
    const newBookingRes = await gql(`
      mutation CreateB($input: CreateBookingInput!) {
        createBooking(input: $input) { id status }
      }
    `, {
      input: {
        resourceId,
        title: "Replacement Booking",
        startTime: "2026-09-01T10:00:00Z",
        endTime: "2026-09-01T11:00:00Z",
      },
    });

    expect(newBookingRes.errors).toBeUndefined();
    expect(newBookingRes.data.createBooking.status).toBe("CONFIRMED");
  });

  it("5. Rescheduling detects conflicts - prevents moving to an occupied slot", async () => {
    const resMut = await gql(`
      mutation {
        createResource(input: { name: "Auditorium", capacity: 50 }) { id }
      }
    `);
    const resourceId = resMut.data.createResource.id;

    // Booking 1: 09:00 - 10:00
    const b1 = await gql(`
      mutation CreateB($input: CreateBookingInput!) {
        createBooking(input: $input) { id }
      }
    `, {
      input: { resourceId, title: "Session 1", startTime: "2026-09-01T09:00:00Z", endTime: "2026-09-01T10:00:00Z" },
    });

    // Booking 2: 11:00 - 12:00
    await gql(`
      mutation CreateB($input: CreateBookingInput!) {
        createBooking(input: $input) { id }
      }
    `, {
      input: { resourceId, title: "Session 2", startTime: "2026-09-01T11:00:00Z", endTime: "2026-09-01T12:00:00Z" },
    });

    // Try rescheduling Booking 1 to 10:30 - 11:30 (overlaps with Session 2)
    const rescheduleRes = await gql(`
      mutation RescheduleB($id: ID!, $startTime: String!, $endTime: String!) {
        rescheduleBooking(id: $id, startTime: $startTime, endTime: $endTime) { id }
      }
    `, {
      id: b1.data.createBooking.id,
      startTime: "2026-09-01T10:30:00Z",
      endTime: "2026-09-01T11:30:00Z",
    });

    expect(rescheduleRes.errors).toBeDefined();
    expect(rescheduleRes.errors[0].message).toContain("conflict");
  });

  it("6. Rescheduling itself doesn't conflict with its current booking", async () => {
    const resMut = await gql(`
      mutation {
        createResource(input: { name: "Design Studio", capacity: 8 }) { id }
      }
    `);
    const resourceId = resMut.data.createResource.id;

    // Original booking: 10:00 - 12:00
    const b1 = await gql(`
      mutation CreateB($input: CreateBookingInput!) {
        createBooking(input: $input) { id }
      }
    `, {
      input: { resourceId, title: "Design Review", startTime: "2026-09-01T10:00:00Z", endTime: "2026-09-01T12:00:00Z" },
    });

    const bookingId = b1.data.createBooking.id;

    // Reschedule to 10:30 - 11:30 (completely inside original range)
    const rescheduleRes = await gql(`
      mutation RescheduleB($id: ID!, $startTime: String!, $endTime: String!) {
        rescheduleBooking(id: $id, startTime: $startTime, endTime: $endTime) {
          id
          startTime
          endTime
        }
      }
    `, {
      id: bookingId,
      startTime: "2026-09-01T10:30:00Z",
      endTime: "2026-09-01T11:30:00Z",
    });

    expect(rescheduleRes.errors).toBeUndefined();
    expect(rescheduleRes.data.rescheduleBooking.startTime).toBe("2026-09-01T10:30:00.000Z");
    expect(rescheduleRes.data.rescheduleBooking.endTime).toBe("2026-09-01T11:30:00.000Z");
  });

  it("7. Concurrent booking attempts -> exactly one succeeds under high concurrency", async () => {
    const resMut = await gql(`
      mutation {
        createResource(input: { name: "Hot Desk 1", capacity: 1 }) { id }
      }
    `);
    const resourceId = resMut.data.createResource.id;

    const startTime = "2026-09-05T14:00:00Z";
    const endTime = "2026-09-05T15:00:00Z";

    // Launch 10 simultaneous booking requests for the exact same slot
    const CONCURRENCY_COUNT = 10;
    const promises = Array.from({ length: CONCURRENCY_COUNT }).map((_, i) =>
      gql(`
        mutation CreateB($input: CreateBookingInput!) {
          createBooking(input: $input) { id }
        }
      `, {
        input: {
          resourceId,
          title: `Concurrent Attempt #${i + 1}`,
          startTime,
          endTime,
        },
      })
    );

    const results = await Promise.all(promises);

    const successful = results.filter((r) => r.data && r.data.createBooking && !r.errors);
    const failed = results.filter((r) => r.errors && r.errors.length > 0);

    expect(successful.length).toBe(1);
    expect(failed.length).toBe(CONCURRENCY_COUNT - 1);

    // Verify DB state
    const confirmedCount = await prisma.booking.count({
      where: {
        resourceId,
        status: "CONFIRMED",
      },
    });
    expect(confirmedCount).toBe(1);
  });

  it("8. Cursor-based pagination works correctly", async () => {
    const resMut = await gql(`
      mutation {
        createResource(input: { name: "Training Room", capacity: 20 }) { id }
      }
    `);
    const resourceId = resMut.data.createResource.id;

    // Create 5 sequential bookings
    for (let i = 1; i <= 5; i++) {
      const hour = String(i + 8).padStart(2, "0");
      const nextHour = String(i + 9).padStart(2, "0");
      await gql(`
        mutation CreateB($input: CreateBookingInput!) {
          createBooking(input: $input) { id }
        }
      `, {
        input: {
          resourceId,
          title: `Slot ${i}`,
          startTime: `2026-09-01T${hour}:00:00Z`,
          endTime: `2026-09-01T${nextHour}:00:00Z`,
        },
      });
    }

    // Page 1: first 2 items
    const page1Res = await gql(`
      query GetB($resourceId: ID, $first: Int) {
        bookings(resourceId: $resourceId, first: $first) {
          totalCount
          edges {
            cursor
            node { title startTime }
          }
          pageInfo {
            hasNextPage
            hasPreviousPage
            startCursor
            endCursor
          }
        }
      }
    `, { resourceId, first: 2 });

    expect(page1Res.errors).toBeUndefined();
    const conn1 = page1Res.data.bookings;
    expect(conn1.totalCount).toBe(5);
    expect(conn1.edges.length).toBe(2);
    expect(conn1.edges[0].node.title).toBe("Slot 1");
    expect(conn1.edges[1].node.title).toBe("Slot 2");
    expect(conn1.pageInfo.hasNextPage).toBe(true);

    // Page 2: next 2 items using after cursor
    const page2Res = await gql(`
      query GetB($resourceId: ID, $first: Int, $after: String) {
        bookings(resourceId: $resourceId, first: $first, after: $after) {
          edges {
            cursor
            node { title startTime }
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
      }
    `, { resourceId, first: 2, after: conn1.pageInfo.endCursor });

    const conn2 = page2Res.data.bookings;
    expect(conn2.edges.length).toBe(2);
    expect(conn2.edges[0].node.title).toBe("Slot 3");
    expect(conn2.edges[1].node.title).toBe("Slot 4");
    expect(conn2.pageInfo.hasNextPage).toBe(true);

    // Page 3: final item
    const page3Res = await gql(`
      query GetB($resourceId: ID, $first: Int, $after: String) {
        bookings(resourceId: $resourceId, first: $first, after: $after) {
          edges {
            cursor
            node { title startTime }
          }
          pageInfo {
            hasNextPage
          }
        }
      }
    `, { resourceId, first: 2, after: conn2.pageInfo.endCursor });

    const conn3 = page3Res.data.bookings;
    expect(conn3.edges.length).toBe(1);
    expect(conn3.edges[0].node.title).toBe("Slot 5");
    expect(conn3.pageInfo.hasNextPage).toBe(false);
  });
});
