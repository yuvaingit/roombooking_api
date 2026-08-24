import prisma from "../db";
import { BookingService } from "../services/bookingService";

export const resolvers = {
  Query: {
    resources: async () => {
      return await prisma.resource.findMany({
        orderBy: { name: "asc" },
      });
    },

    resource: async (_: any, args: { id: string }) => {
      return await prisma.resource.findUnique({
        where: { id: args.id },
      });
    },

    bookings: async (
      _: any,
      args: {
        resourceId?: string;
        status?: "CONFIRMED" | "CANCELLED";
        first?: number;
        after?: string;
      }
    ) => {
      return await BookingService.getBookings(args);
    },

    checkAvailability: async (
      _: any,
      args: {
        resourceId: string;
        startTime: string;
        endTime: string;
        excludeBookingId?: string;
      }
    ) => {
      return await BookingService.checkAvailability(
        args.resourceId,
        args.startTime,
        args.endTime,
        args.excludeBookingId
      );
    },
  },

  Mutation: {
    createResource: async (
      _: any,
      args: { input: { name: string; capacity: number } }
    ) => {
      return await BookingService.createResource(
        args.input.name,
        args.input.capacity
      );
    },

    createBooking: async (
      _: any,
      args: {
        input: {
          resourceId: string;
          title: string;
          startTime: string;
          endTime: string;
        };
      }
    ) => {
      return await BookingService.createBooking(
        args.input.resourceId,
        args.input.title,
        args.input.startTime,
        args.input.endTime
      );
    },

    rescheduleBooking: async (
      _: any,
      args: {
        id?: string;
        startTime?: string;
        endTime?: string;
        input?: { id: string; startTime: string; endTime: string };
      }
    ) => {
      const id = args.input?.id || args.id;
      const startTime = args.input?.startTime || args.startTime;
      const endTime = args.input?.endTime || args.endTime;

      if (!id || !startTime || !endTime) {
        throw new Error("Missing required arguments for rescheduleBooking (id, startTime, endTime)");
      }

      return await BookingService.rescheduleBooking(id, startTime, endTime);
    },

    cancelBooking: async (_: any, args: { id: string }) => {
      return await BookingService.cancelBooking(args.id);
    },

    deleteBooking: async (_: any, args: { id: string }) => {
      return await BookingService.deleteBooking(args.id);
    },
  },

  Resource: {
    createdAt: (parent: any) => new Date(parent.createdAt).toISOString(),
    updatedAt: (parent: any) => new Date(parent.updatedAt).toISOString(),
    bookings: async (
      parent: any,
      args: { first?: number; after?: string; status?: "CONFIRMED" | "CANCELLED" }
    ) => {
      return await BookingService.getBookings({
        resourceId: parent.id,
        status: args.status,
        first: args.first,
        after: args.after,
      });
    },
  },

  Booking: {
    createdAt: (parent: any) => new Date(parent.createdAt).toISOString(),
    updatedAt: (parent: any) => new Date(parent.updatedAt).toISOString(),
    startTime: (parent: any) => new Date(parent.startTime).toISOString(),
    endTime: (parent: any) => new Date(parent.endTime).toISOString(),
    resource: async (parent: any) => {
      return await prisma.resource.findUnique({
        where: { id: parent.resourceId },
      });
    },
  },
};
