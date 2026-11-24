import { getCatalog } from "../controllers/catalogController.js";

// "METHOD /path" -> controller
export const catalogRoutes = {
  "GET /api/catalog": getCatalog,
};
