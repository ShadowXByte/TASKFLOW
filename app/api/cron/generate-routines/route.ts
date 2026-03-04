import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// This endpoint should be called by a cron job at midnight
// Vercel cron or external service can trigger this
export async function GET(request: Request) {
  // Simple auth check - can be improved with secret key
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    const today = new Date();
    const dayOfWeek = today.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
    const todayDate = today.toISOString().split("T")[0]; // YYYY-MM-DD

    // Get all active routines for today's day or daily routines (dayOfWeek = 7)
    const routines = await prisma.routine.findMany({
      where: {
        isActive: true,
        OR: [
          { dayOfWeek: dayOfWeek },
          { dayOfWeek: 7 }, // Daily routines
        ],
      },
      include: {
        user: {
          select: {
            id: true,
          },
        },
      },
    });

    let createdCount = 0;
    let skippedCount = 0;

    for (const routine of routines) {
      // Check if task already exists for this routine today
      const existingTask = await prisma.task.findFirst({
        where: {
          routineId: routine.id,
          userId: routine.userId,
          dueDate: todayDate,
        },
      });

      if (existingTask) {
        skippedCount++;
        continue; // Skip if already generated
      }

      // Create task from routine
      await prisma.task.create({
        data: {
          title: routine.title,
          description: routine.description,
          dueDate: todayDate,
          dueTime: routine.time,
          priority: routine.priority,
          completed: false,
          userId: routine.userId,
          routineId: routine.id,
        },
      });

      createdCount++;
    }

    return NextResponse.json({
      success: true,
      message: `Generated ${createdCount} tasks, skipped ${skippedCount} existing`,
      date: todayDate,
      dayOfWeek,
    });
  } catch (error) {
    console.error("Error generating routine tasks:", error);
    return NextResponse.json(
      { message: "Failed to generate routine tasks", error: String(error) },
      { status: 500 }
    );
  }
}
