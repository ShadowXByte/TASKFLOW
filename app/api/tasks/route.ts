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
    dueDate?: string;
    dueTime?: string;
    priority?: TaskPriority;
  };
  const title = body.title?.trim();
  const dueDate = body.dueDate?.trim();
  const dueTime = body.dueTime?.trim() || "09:00";
  const priority = body.priority ?? "MEDIUM";

  if (!title || !dueDate) {
    return NextResponse.json({ message: "Title and due date are required." }, { status: 400 });
  }

  if (!PRIORITIES.includes(priority)) {
    return NextResponse.json({ message: "Invalid priority value." }, { status: 400 });
  }

  if (!TIME_REGEX.test(dueTime)) {
    return NextResponse.json({ message: "Invalid due time value." }, { status: 400 });
  }

  const task = await prisma.task.create({
    data: {
      title,
      dueDate,
      dueTime,
      priority,
      userId: session.user.id,
    },
  });

  return NextResponse.json(task, { status: 201 });
}
