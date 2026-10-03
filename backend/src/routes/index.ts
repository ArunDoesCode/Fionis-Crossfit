import { Hono } from "hono";

import type { AppEnv } from "../lib/types";
import { MAIN_ROUTES } from "./end-points";
import { healthRoutes } from "./health";

export const mainRouter = new Hono<AppEnv>();

mainRouter.route(MAIN_ROUTES.health, healthRoutes);
