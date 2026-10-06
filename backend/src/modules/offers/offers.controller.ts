import { Request, Response } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import { unauthorized } from "../../utils/errors";
import * as offersService from "./offers.service";
import * as documentsService from "./offer-documents.service";
import { runOfferReminders } from "./offer-reminders";

export const createOffer = asyncHandler(async (req: Request, res: Response) => {
  if (!req.auth) throw unauthorized();
  const offer = await offersService.createOffer(req.auth.userId, req.auth.role, req.body);
  res.status(201).json({ data: offer });
});

export const listOffers = asyncHandler(async (req: Request, res: Response) => {
  if (!req.auth) throw unauthorized();
  const result = await offersService.listOffers(req, req.auth.userId, req.auth.role);
  res.status(200).json(result);
});

export const getOfferById = asyncHandler(async (req: Request, res: Response) => {
  if (!req.auth) throw unauthorized();
  const offer = await offersService.getOfferById(req.params.id, req.auth.userId, req.auth.role);
  res.status(200).json({ data: offer });
});

export const respondToOffer = asyncHandler(async (req: Request, res: Response) => {
  if (!req.auth) throw unauthorized();
  const offer = await offersService.respondToOffer(req.params.id, req.auth.userId, req.body);
  res.status(200).json({ data: offer });
});

export const updateOffer = asyncHandler(async (req: Request, res: Response) => {
  if (!req.auth) throw unauthorized();
  const offer = await offersService.updateOffer(req.params.id, req.auth.userId, req.auth.role, req.body);
  res.status(200).json({ data: offer });
});

export const withdrawOffer = asyncHandler(async (req: Request, res: Response) => {
  if (!req.auth) throw unauthorized();
  const offer = await offersService.withdrawOffer(req.params.id, req.auth.userId, req.auth.role, req.body);
  res.status(200).json({ data: offer });
});

export const convertInternship = asyncHandler(async (req: Request, res: Response) => {
  if (!req.auth) throw unauthorized();
  const result = await offersService.convertInternship(req.params.id, req.auth.userId, req.auth.role, req.body);
  res.status(200).json({ data: result });
});

export const requestDocument = asyncHandler(async (req: Request, res: Response) => {
  if (!req.auth) throw unauthorized();
  const doc = await documentsService.requestDocument(req.params.id, req.auth.userId, req.auth.role, req.body);
  res.status(201).json({ data: doc });
});

export const uploadDocument = asyncHandler(async (req: Request, res: Response) => {
  if (!req.auth) throw unauthorized();
  const doc = await documentsService.uploadDocument(
    req.params.id,
    req.params.documentId,
    req.auth.userId,
    req.auth.role,
    req.file
  );
  res.status(200).json({ data: doc });
});

export const reviewDocument = asyncHandler(async (req: Request, res: Response) => {
  if (!req.auth) throw unauthorized();
  const doc = await documentsService.reviewDocument(
    req.params.id,
    req.params.documentId,
    req.auth.userId,
    req.auth.role,
    req.body
  );
  res.status(200).json({ data: doc });
});

export const downloadDocument = asyncHandler(async (req: Request, res: Response) => {
  if (!req.auth) throw unauthorized();
  const { fullPath, fileName } = await documentsService.documentFile(
    req.params.id,
    req.params.documentId,
    req.auth.userId,
    req.auth.role
  );
  res.setHeader("Cache-Control", "private, no-store");
  res.download(fullPath, fileName);
});

export const runReminders = asyncHandler(async (_req: Request, res: Response) => {
  res.status(200).json({ data: await runOfferReminders() });
});
