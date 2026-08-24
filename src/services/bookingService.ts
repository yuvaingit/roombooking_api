import { GraphQLError } from "graphql";
import { PrismaClientKnownRequestError } from "@prisma/client/runtime/library";
import prisma from "../db";
import { encodeCursor, decodeCursor } from "../utils/pagination";

export interface AvailabilityResult {
  available: boolean;
  conflictingBooking?: any;
  reason?: string;
}

export class BookingService {
  /**
   * Validates time window inputs
   */
  private static validateTimeRange(start: Date, end: Date): void {
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      throw new GraphQLError("Invalid date format provided");
    }
    if (start.getTime() >= end.getTime()) {
      throw new GraphQLError("startTime must be strictly before endTime");
    }
  }

  /**
   * Check if a time slot [startTime, endTime) is available for a resource
   */
  static async checkAvailability(
    resourceId: string,
    startTimeStr: string,
    endTimeStr: string,
    excludeBookingId?: string
  ): Promise<AvailabilityResult> {
    const start = new Date(startTimeStr);
    const end = new Date(endTimeStr);
    this.validateTimeRange(start, end);

    const resource = await prisma.resource.findUnique({
      where: { id: resourceId },
    });

    if (!resource) {
      throw new GraphQLError(`Resource with ID '${resourceId}' not found`);
    }

    const conflictingBooking = await prisma.booking.findFirst({
      where: {
        resourceId,
        status: "CONFIRMED",
        id: excludeBookingId ? { not: excludeBookingId } : undefined,
        startTime: { lt: end },
        endTime: { gt: start },
      },
    });

    if (conflictingBooking) {
      return {
        available: false,
        conflictingBooking,
        reason: "Time slot overlaps with an existing confirmed booking",
      };
    }

    return {
      available: true,
      conflictingBooking: undefined,
      reason: undefined,
    };
  }

  /**
   * Create a resource
   */
  static async createResource(name: string, capacity: number) {
    if (!name || name.trim().length === 0) {
      throw new GraphQLError("Resource name cannot be empty");
    }
    if (capacity <= 0) {
      throw new GraphQLError("Resource capacity must be a positive integer");
    }

    return await prisma.resource.create({
      data: {
        name: name.trim(),
        capacity,
      },
    });
  }

  /**
   * Create a new booking with concurrency-safe transaction and DB constraint handling
   */
  static async createBooking(
    resourceId: string,
    title: string,
    startTimeStr: string,
    endTimeStr: string
  ) {
    const start = new Date(startTimeStr);
    const end = new Date(endTimeStr);
    this.validateTimeRange(start, end);

    if (!title || title.trim().length === 0) {
      throw new GraphQLError("Booking title cannot be empty");
    }

    const resource = await prisma.resource.findUnique({
      where: { id: resourceId },
    });

    if (!resource) {
      throw new GraphQLError(`Resource with ID '${resourceId}' not found`);
    }

    try {
      return await prisma.$transaction(async (tx) => {
        // App-level conflict check
        const conflict = await tx.booking.findFirst({
          where: {
            resourceId,
            status: "CONFIRMED",
            startTime: { lt: end },
            endTime: { gt: start },
          },
        });

        if (conflict) {
          throw new GraphQLError(
            "Booking conflict: The requested time slot overlaps with an existing booking"
          );
        }

        return await tx.booking.create({
          data: {
            resourceId,
            title: title.trim(),
            startTime: start,
            endTime: end,
            status: "CONFIRMED",
          },
        });
      });
    } catch (error: any) {
      // Handle PostgreSQL Exclusion Constraint Violation (P2002 or Raw DB Error P2010/23P01)
      if (
        (error instanceof PrismaClientKnownRequestError && error.code === "P2002") ||
        error?.message?.includes("no_overlapping_confirmed_bookings") ||
        error?.code === "23P01"
      ) {
        throw new GraphQLError(
          "Booking conflict: The requested time slot is no longer available due to a concurrent reservation"
        );
      }
      throw error;
    }
  }

  /**
   * Reschedule an existing booking
   */
  static async rescheduleBooking(
    bookingId: string,
    startTimeStr: string,
    endTimeStr: string
  ) {
    const start = new Date(startTimeStr);
    const end = new Date(endTimeStr);
    this.validateTimeRange(start, end);

    const existingBooking = await prisma.booking.findUnique({
      where: { id: bookingId },
    });

    if (!existingBooking) {
      throw new GraphQLError(`Booking with ID '${bookingId}' not found`);
    }

    try {
      return await prisma.$transaction(async (tx) => {
        // App-level conflict check excluding current booking ID
        const conflict = await tx.booking.findFirst({
          where: {
            resourceId: existingBooking.resourceId,
            status: "CONFIRMED",
            id: { not: bookingId },
            startTime: { lt: end },
            endTime: { gt: start },
          },
        });

        if (conflict) {
          throw new GraphQLError(
            "Reschedule conflict: The new time slot overlaps with an existing confirmed booking"
          );
        }

        return await tx.booking.update({
          where: { id: bookingId },
          data: {
            startTime: start,
            endTime: end,
          },
        });
      });
    } catch (error: any) {
      if (
        (error instanceof PrismaClientKnownRequestError && error.code === "P2002") ||
        error?.message?.includes("no_overlapping_confirmed_bookings") ||
        error?.code === "23P01"
      ) {
        throw new GraphQLError(
          "Reschedule conflict: The new time slot overlaps with a concurrent booking"
        );
      }
      throw error;
    }
  }

  /**
   * Cancel a booking
   */
  static async cancelBooking(bookingId: string) {
    const existing = await prisma.booking.findUnique({
      where: { id: bookingId },
    });

    if (!existing) {
      throw new GraphQLError(`Booking with ID '${bookingId}' not found`);
    }

    return await prisma.booking.update({
      where: { id: bookingId },
      data: { status: "CANCELLED" },
    });
  }

  /**
   * Delete a booking
   */
  static async deleteBooking(bookingId: string): Promise<boolean> {
    const existing = await prisma.booking.findUnique({
      where: { id: bookingId },
    });

    if (!existing) {
      throw new GraphQLError(`Booking with ID '${bookingId}' not found`);
    }

    await prisma.booking.delete({
      where: { id: bookingId },
    });

    return true;
  }

  /**
   * Paginated bookings query with cursor support
   */
  static async getBookings(params: {
    resourceId?: string;
    status?: "CONFIRMED" | "CANCELLED";
    first?: number;
    after?: string;
  }) {
    const take = params.first ? Math.min(Math.max(params.first, 1), 100) : 10;

    const where: any = {};
    if (params.resourceId) {
      where.resourceId = params.resourceId;
    }
    if (params.status) {
      where.status = params.status;
    }

    if (params.after) {
      const decoded = decodeCursor(params.after);
      const cursorDate = new Date(decoded.s);

      where.OR = [
        { startTime: { gt: cursorDate } },
        {
          startTime: cursorDate,
          id: { gt: decoded.i },
        },
      ];
    }

    const itemsPlusOne = await prisma.booking.findMany({
      where,
      orderBy: [{ startTime: "asc" }, { id: "asc" }],
      take: take + 1,
    });

    const hasNextPage = itemsPlusOne.length > take;
    const items = hasNextPage ? itemsPlusOne.slice(0, take) : itemsPlusOne;

    const totalCount = await prisma.booking.count({
      where: {
        resourceId: params.resourceId,
        status: params.status,
      },
    });

    const edges = items.map((node) => ({
      cursor: encodeCursor(node.startTime, node.id),
      node,
    }));

    const startCursor = edges.length > 0 ? edges[0].cursor : null;
    const endCursor = edges.length > 0 ? edges[edges.length - 1].cursor : null;

    return {
      edges,
      pageInfo: {
        hasNextPage,
        hasPreviousPage: !!params.after,
        startCursor,
        endCursor,
      },
      totalCount,
    };
  }
}
