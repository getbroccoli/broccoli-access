import { createFileStorageService } from "../../src/core/files";
import {
  createInstanceService,
  createOwnerService,
  createSetupSessionService,
} from "../../src/core/instance";
import { createRecordHistoryService } from "../../src/core/records";

/** Services without dependencies, built once for every test. */
export const instances = createInstanceService();
export const owners = createOwnerService();
export const setupSessions = createSetupSessionService();
export const fileStorage = createFileStorageService();
export const recordHistory = createRecordHistoryService();
