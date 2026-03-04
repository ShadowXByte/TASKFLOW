import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const PRIORITIES = ["LOW", "MEDIUM", "HIGH"] as const;
type RoutinePriority = (typeof PRIORITIES)[number];
const TIME_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const routineId = parseInt(id, 10);
  if (Number.isNaN(routineId)) {
    return NextResponse.json({ message: "Invalid routine ID" }, { status: 400 });
  }

  // Check if routine exists and belongs to user
  const existing = await prisma.routine.findUnique({
    where: { id: routineId },
  });

  if (!existing || existing.userId !== session.user.id) {
    return NextResponse.json({ message: "Routine not found" }, { status: 404 });
  }

  const body = (await request.json()) as {
    title?: string;
    description?: string;
    dayOfWeek?: number;
    time?: string;
    priority?: RoutinePriority;
    isActive?: boolean;
  };

  // Validate fields if provided
  if (body.title !== undefined && !body.title.trim()) {
    return NextResponse.json({ message: "Title cannot be empty" }, { status: 400 });
  }

  if (body.priority && !PRIORITIES.includes(body.priority)) {
    return NextResponse.json({ message: "Invalid priority value." }, { status: 400 });
  }

  if (body.time && !TIME_REGEX.test(body.time)) {
    return NextResponse.json({ message: "Invalid time format. Use HH:MM." }, { status: 400 });
  }

  if (body.dayOfWeek !== undefined && (body.dayOfWeek < 0 || body.dayOfWeek > 7)) {
    return NextResponse.json({ message: "Invalid day. Use 0-6 for days or 7 for daily." }, { status: 400 });
  }

  const updated = await prisma.routine.update({
    where: { id: routineId },
    data: {
      ...(body.title !== undefined && { title: body.title.trim() }),
      ...(body.description !== undefined && { description: body.description.trim() || null }),
      ...(body.dayOfWeek !== undefined && { dayOfWeek: body.dayOfWeek }),
      ...(body.time !== undefined && { time: body.time }),
      ...(body.priority !== undefined && { priority: body.priority }),
      ...(body.isActive !== undefined && { isActive: body.isActive }),
    },
  });

  return NextResponse.json(updated);
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const routineId = parseInt(id, 10);
  if (Number.isNaN(routineId)) {
    return NextResponse.json({ message: "Invalid routine ID" }, { status: 400 });
  }

  // Check if routine exists and belongs to user
  const existing = await prisma.routine.findUnique({
    where: { id: routineId },
  });

  if (!existing || existing.userId !== session.user.id) {
    return NextResponse.json({ message: "Routine not found" }, { status: 404 });
  }

  await prisma.routine.delete({
    where: { id: routineId },
  });

  return NextResponse.json({ message: "Routine deleted" }, { status: 200 });
}
