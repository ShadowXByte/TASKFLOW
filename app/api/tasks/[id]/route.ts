import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const PRIORITIES = ["LOW", "MEDIUM", "HIGH"] as const;
type TaskPriority = (typeof PRIORITIES)[number];
const TIME_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const taskId = Number(id);
  if (Number.isNaN(taskId)) {
    return NextResponse.json({ message: "Invalid task id." }, { status: 400 });
  }

  const body = (await request.json()) as {
    completed?: boolean;
    title?: string;
    description?: string | null;
    dueDate?: string;
    dueTime?: string;
    priority?: TaskPriority;
  };

  const existing = await prisma.task.findFirst({ where: { id: taskId, userId: session.user.id } });
  if (!existing) {
    return NextResponse.json({ message: "Task not found." }, { status: 404 });
  }

  const data: {
    completed?: boolean;
    title?: string;
    description?: string | null;
    dueDate?: string;
    dueTime?: string;
    priority?: TaskPriority;
  } = {};

  if (typeof body.completed === "boolean") {
    data.completed = body.completed;
  }

  if (typeof body.title === "string") {
    const title = body.title.trim();
    if (!title) {
      return NextResponse.json({ message: "Title cannot be empty." }, { status: 400 });
    }
    data.title = title;
  }

  if (typeof body.description === "string") {
    const description = body.description.trim();
    data.description = description || null;
  } else if (body.description === null) {
    data.description = null;
  }

  if (typeof body.dueDate === "string") {
    const dueDate = body.dueDate.trim();
    if (!dueDate) {
      return NextResponse.json({ message: "Due date is required." }, { status: 400 });
    }
    data.dueDate = dueDate;
  }

  if (typeof body.dueTime === "string") {
    const dueTime = body.dueTime.trim();
    if (!TIME_REGEX.test(dueTime)) {
      return NextResponse.json({ message: "Invalid due time value." }, { status: 400 });
    }
    data.dueTime = dueTime;
  }

  if (typeof body.priority === "string") {
    if (!PRIORITIES.includes(body.priority)) {
      return NextResponse.json({ message: "Invalid priority value." }, { status: 400 });
    }
    data.priority = body.priority;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ message: "No valid fields provided." }, { status: 400 });
  }

  const updated = await prisma.task.update({
    where: { id: taskId },
    data,
  });

  return NextResponse.json(updated);
}

export async function DELETE(_request: Request, context: RouteContext) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const taskId = Number(id);
  if (Number.isNaN(taskId)) {
    return NextResponse.json({ message: "Invalid task id." }, { status: 400 });
  }

  const existing = await prisma.task.findFirst({ where: { id: taskId, userId: session.user.id } });
  if (!existing) {
    return NextResponse.json({ message: "Task not found." }, { status: 404 });
  }

  await prisma.task.delete({ where: { id: taskId } });
  return NextResponse.json({ success: true });
}
