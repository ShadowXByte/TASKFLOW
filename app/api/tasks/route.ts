import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const PRIORITIES = ["LOW", "MEDIUM", "HIGH"] as const;
type TaskPriority = (typeof PRIORITIES)[number];
const TIME_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const tasks = await prisma.task.findMany({
    where: { userId: session.user.id },
    orderBy: [{ dueDate: "asc" }, { dueTime: "asc" }, { createdAt: "asc" }],
  });

  return NextResponse.json(tasks);
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as {
    title?: string;
    description?: string;
    dueDate?: string;
    dueTime?: string;
    priority?: TaskPriority;
    completed?: boolean;
    routineId?: number;
  };
  const title = body.title?.trim();
  const description = typeof body.description === "string" ? body.description.trim() : "";
  const dueDate = body.dueDate?.trim();
  const dueTime = body.dueTime?.trim() || "09:00";
  const priority = body.priority ?? "MEDIUM";
  const completed = typeof body.completed === "boolean" ? body.completed : false;
  const routineId = typeof body.routineId === "number" ? body.routineId : null;

  if (!title || !dueDate) {
    return NextResponse.json({ message: "Title and due date are required." }, { status: 400 });
  }

  if (!PRIORITIES.includes(priority)) {
    return NextResponse.json({ message: "Invalid priority value." }, { status: 400 });
  }

  if (!TIME_REGEX.test(dueTime)) {
    return NextResponse.json({ message: "Invalid due time value." }, { status: 400 });
  }

  if (routineId !== null) {
    const routine = await prisma.routine.findFirst({
      where: { id: routineId, userId: session.user.id },
      select: { id: true },
    });

    if (!routine) {
      return NextResponse.json({ message: "Invalid routine reference." }, { status: 400 });
    }
  }

  const task = await prisma.task.create({
    data: {
      title,
      description: description || null,
      dueDate,
      dueTime,
      priority,
      completed,
      routineId,
      userId: session.user.id,
    },
  });

  return NextResponse.json(task, { status: 201 });
}
