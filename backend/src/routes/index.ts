import { Hono } from "hono";

import type { AppEnv } from "../lib/types";
import { assessmentsRoutes } from "./assessments";
import { authRoutes } from "./auth";
import { dueRoutes } from "./due";
import { MAIN_ROUTES } from "./end-points";
import { healthRoutes } from "./health";
import { membersRoutes } from "./members";
import { progressRoutes } from "./progress";
import { setupRoutes } from "./setup";
import { vitalsRoutes } from "./vitals";

export const mainRouter = new Hono<AppEnv>();

mainRouter.route(MAIN_ROUTES.health, healthRoutes);
mainRouter.route(MAIN_ROUTES.auth, authRoutes);
// Routers mounted at "" share URL prefixes and own their full sub-paths (see end-points.ts).
mainRouter.route(MAIN_ROUTES.setup, setupRoutes);
mainRouter.route(MAIN_ROUTES.members, membersRoutes);
mainRouter.route(MAIN_ROUTES.assessments, assessmentsRoutes);
mainRouter.route(MAIN_ROUTES.due, dueRoutes);
mainRouter.route(MAIN_ROUTES.progress, progressRoutes);
mainRouter.route(MAIN_ROUTES.vitals, vitalsRoutes);
