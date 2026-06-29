import { Router } from "express";
import { ethers } from "ethers";
import { NotificationRepository } from "../repositories/notificationRepository";
import { asyncHandler } from "../utils/asyncHandler";

export const createNotificationRouter = (
  repository = new NotificationRepository()
) => {
  const router = Router();

  router.get(
    "/",
    asyncHandler(async (req, res) => {
      const recipientAddress =
        typeof req.query.recipientAddress === "string"
          ? req.query.recipientAddress
          : "";
      if (!ethers.isAddress(recipientAddress)) {
        res.status(400).json({ error: "recipientAddress must be a valid Ethereum address." });
        return;
      }

      const limit = Math.min(
        50,
        Math.max(1, Number(req.query.limit ?? 25) || 25)
      );
      const notifications = await repository.listByRecipient(recipientAddress, limit);
      res.json(notifications);
    })
  );

  router.get(
    "/unread-count",
    asyncHandler(async (req, res) => {
      const recipientAddress =
        typeof req.query.recipientAddress === "string"
          ? req.query.recipientAddress
          : "";
      if (!ethers.isAddress(recipientAddress)) {
        res.status(400).json({ error: "recipientAddress must be a valid Ethereum address." });
        return;
      }

      const count = await repository.countUnread(recipientAddress);
      res.json({ count });
    })
  );

  router.post(
    "/:id/read",
    asyncHandler(async (req, res) => {
      const id = Number(req.params.id);
      const recipientAddress = String(req.body?.recipientAddress ?? "");
      if (Number.isNaN(id)) {
        res.status(400).json({ error: "Notification id must be numeric." });
        return;
      }
      if (!ethers.isAddress(recipientAddress)) {
        res.status(400).json({ error: "recipientAddress must be a valid Ethereum address." });
        return;
      }

      const notification = await repository.markRead(id, recipientAddress);
      if (!notification) {
        res.status(404).json({ error: "Notification not found." });
        return;
      }

      res.json(notification);
    })
  );

  router.post(
    "/read-all",
    asyncHandler(async (req, res) => {
      const recipientAddress = String(req.body?.recipientAddress ?? "");
      if (!ethers.isAddress(recipientAddress)) {
        res.status(400).json({ error: "recipientAddress must be a valid Ethereum address." });
        return;
      }

      await repository.markAllRead(recipientAddress);
      res.json({ ok: true });
    })
  );

  return router;
};
