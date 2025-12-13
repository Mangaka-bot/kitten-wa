import "dotenv/config";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "../generated/prisma/client.ts";
import {
  modelExtensions,
  groupExtensions,
  metadataExtensions,
  userExtensions
} from "./extensions.js";

const connectionString = `${process.env.DATABASE_URL}`;

const adapter = new PrismaBetterSqlite3({ url: connectionString });
const client = new PrismaClient({ adapter });

client.$queryRaw`PRAGMA journal_mode = WAL;`;
client.$queryRaw`PRAGMA busy_timeout = 5000;`; 

const db = client
  .$extends(modelExtensions)
  .$extends(groupExtensions)
  .$extends(metadataExtensions)
  .$extends(userExtensions)

export default db;