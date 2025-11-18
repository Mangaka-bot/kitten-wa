-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "key" JSONB,
    "timestamp" INTEGER,
    "raw" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "groupId" TEXT,
    "senderId" TEXT,
    "type" TEXT,
    CONSTRAINT "Message_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Message_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Contact" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "lid" TEXT,
    "phoneNumber" TEXT,
    "name" TEXT,
    "notify" TEXT,
    "imgUrl" TEXT,
    "status" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Contact_id_fkey" FOREIGN KEY ("id") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT,
    "phoneNumber" TEXT,
    "presence" TEXT DEFAULT 'unavailable',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "metaData" JSONB
);

-- CreateTable
CREATE TABLE "Group" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "subject" TEXT,
    "subjectOwner" TEXT,
    "subjectOwnerPn" TEXT,
    "subjectTime" INTEGER,
    "creation" INTEGER,
    "desc" TEXT,
    "descId" TEXT,
    "descTime" INTEGER,
    "descOwner" TEXT,
    "descOwnerPn" TEXT,
    "restrict" BOOLEAN,
    "announce" BOOLEAN,
    "isCommunity" BOOLEAN,
    "isCommunityAnnounce" BOOLEAN,
    "communityId" TEXT,
    "linkedParent" TEXT,
    "size" INTEGER,
    "ephemeralDuration" INTEGER,
    "inviteCode" TEXT,
    "joinApprovalMode" BOOLEAN,
    "memberAddMode" BOOLEAN,
    "author" TEXT,
    "authorPn" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "ownerId" TEXT,
    "ownerPn" TEXT,
    "owner_country_code" TEXT,
    "metaData" JSONB,
    CONSTRAINT "Group_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Participant" (
    "id" TEXT NOT NULL,
    "jid" TEXT,
    "lid" TEXT,
    "groupId" TEXT NOT NULL,
    "admin" TEXT,

    PRIMARY KEY ("id", "groupId"),
    CONSTRAINT "Participant_jid_fkey" FOREIGN KEY ("jid") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Participant_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Blocklist" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "timestamp" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Blocklist_id_fkey" FOREIGN KEY ("id") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Message_id_key" ON "Message"("id");

-- CreateIndex
CREATE INDEX "Message_timestamp_idx" ON "Message"("timestamp");

-- CreateIndex
CREATE INDEX "Message_groupId_idx" ON "Message"("groupId");

-- CreateIndex
CREATE INDEX "Message_senderId_idx" ON "Message"("senderId");

-- CreateIndex
CREATE INDEX "Message_type_idx" ON "Message"("type");

-- CreateIndex
CREATE UNIQUE INDEX "Contact_id_key" ON "Contact"("id");

-- CreateIndex
CREATE UNIQUE INDEX "User_id_key" ON "User"("id");

-- CreateIndex
CREATE INDEX "User_presence_idx" ON "User"("presence");

-- CreateIndex
CREATE UNIQUE INDEX "Group_id_key" ON "Group"("id");

-- CreateIndex
CREATE UNIQUE INDEX "Blocklist_id_key" ON "Blocklist"("id");
