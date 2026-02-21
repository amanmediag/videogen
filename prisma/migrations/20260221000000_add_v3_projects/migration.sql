-- CreateTable
CREATE TABLE "V3Project" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "V3Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "V3Video" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "aspectRatio" TEXT NOT NULL DEFAULT 'portrait',
    "duration" TEXT NOT NULL DEFAULT '15',
    "taskId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'idle',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "resultUrl" TEXT,
    "localPath" TEXT,
    "characterName" TEXT,
    "characterTaskId" TEXT,
    "characterStatus" TEXT,
    "characterProgress" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "V3Video_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "V3Video" ADD CONSTRAINT "V3Video_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "V3Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
