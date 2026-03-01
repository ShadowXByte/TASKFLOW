import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendWebPush, isPushConfigured } from "@/lib/push";

const CRON_GRACE_MS = 10 * 60 * 1000;

type PushTask = {
  id: number;
  title: string;
  dueDate: string;
  dueTime: string;
  user: {
    pushSubscriptions: Array<{
      id: string;
      endpoint: string;
      p256dh: string;
      auth: string;
    }>;
  };
};

const prismaClient = prisma as unknown as {
  task: {
    findMany: (args: unknown) => Promise<PushTask[]>;
  };
  notificationLog: {
    findUnique: (args: unknown) => Promise<unknown>;
    create: (args: unknown) => Promise<unknown>;
  };
  pushSubscription: {
    delete: (args: unknown) => Promise<unknown>;
  };
};

const isAuthorized = (request: Request) => {
  const vercelCronHeader = request.headers.get("x-vercel-cron");
  if (vercelCronHeader) {
    return true;
  }

  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return false;
  }

  const secret = authHeader.slice("Bearer ".length);
  return Boolean(process.env.CRON_SECRET) && secret === process.env.CRON_SECRET;
};

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  if (!isPushConfigured()) {
    return NextResponse.json({ message: "Push is not configured." }, { status: 400 });
  }

  const now = Date.now();
  const cutoff = now - CRON_GRACE_MS;

  const tasks = await prismaClient.task.findMany({
    where: {
      completed: false,
      user: {
        pushSubscriptions: {
          some: {},
        },
      },
    },
    include: {
      user: {
        include: {
          pushSubscriptions: true,
        },
      },
    },
  });

  let sent = 0;
  let removedSubscriptions = 0;

  for (const task of tasks) {
    const dueAt = new Date(`${task.dueDate}T${task.dueTime}:00`).getTime();
    if (Number.isNaN(dueAt) || dueAt > now || dueAt < cutoff) {
      continue;
    }

    for (const subscription of task.user.pushSubscriptions) {
      const alreadySent = await prismaClient.notificationLog.findUnique({
        where: {
          taskId_pushSubscriptionId_dueDate_dueTime: {
            taskId: task.id,
            pushSubscriptionId: subscription.id,
            dueDate: task.dueDate,
            dueTime: task.dueTime,
          },
        },
      });

      if (alreadySent) {
        continue;
      }

      try {
        await sendWebPush(
          {
            endpoint: subscription.endpoint,
            keys: {
              p256dh: subscription.p256dh,
              auth: subscription.auth,
            },
          },
          {
            title: `Task Due: ${task.title}`,
            body: `Due now at ${task.dueTime} (${task.dueDate})`,
            url: "/workspace",
          },
        );

        await prismaClient.notificationLog.create({
          data: {
            taskId: task.id,
            pushSubscriptionId: subscription.id,
            dueDate: task.dueDate,
            dueTime: task.dueTime,
          },
        });

        sent += 1;
      } catch (error: unknown) {
        const statusCode =
          typeof error === "object" &&
          error !== null &&
          "statusCode" in error &&
          typeof (error as { statusCode?: unknown }).statusCode === "number"
            ? ((error as { statusCode: number }).statusCode)
            : undefined;

        if (statusCode === 404 || statusCode === 410) {
          await prismaClient.pushSubscription.delete({ where: { id: subscription.id } });
          removedSubscriptions += 1;
        }
      }
    }
  }

  return NextResponse.json({
    ok: true,
    sent,
    removedSubscriptions,
  });
}

export async function GET(request: Request) {
  return POST(request);
}
