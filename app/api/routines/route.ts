import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const PRIORITIES = ["LOW", "MEDIUM", "HIGH"] as const;
type RoutinePriority = (typeof PRIORITIES)[number];
const TIME_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const routines = await prisma.routine.findMany({
    where: { userId: session.user.id },
    orderBy: [{ dayOfWeek: "asc" }, { time: "asc" }],
  });

  return NextResponse.json(routines);
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as {
    title?: string;
    description?: string;
    dayOfWeek?: number;
    time?: string;
    priority?: RoutinePriority;
    isActive?: boolean;
  };

  const title = body.title?.trim();
  const description = typeof body.description === "string" ? body.description.trim() : "";
  const dayOfWeek = body.dayOfWeek ?? 7; // Default to daily
  const time = body.time?.trim() || "09:00";
  const priority = body.priority ?? "MEDIUM";
  const isActive = body.isActive !== false; // Default true

  if (!title) {
    return NextResponse.json({ message: "Title is required." }, { status: 400 });
  }

  if (!PRIORITIES.includes(priority)) {
    return NextResponse.json({ message: "Invalid priority value." }, { status: 400 });
  }

  if (!TIME_REGEX.test(time)) {
    return NextResponse.json({ message: "Invalid time format. Use HH:MM." }, { status: 400 });
  }

  if (dayOfWeek < 0 || dayOfWeek > 7) {
    return NextResponse.json({ message: "Invalid day. Use 0-6 for days or 7 for daily." }, { status: 400 });
  }

  const routine = await prisma.routine.create({
    data: {
      title,
      description: description || null,
      dayOfWeek,
      time,
      priority,
      isActive,
      userId: session.user.id,
    },
  });

  return NextResponse.json(routine, { status: 201 });
}
