-- CreateEnum
CREATE TYPE "QrCodeCategory" AS ENUM ('MENU', 'BOOKING', 'EVENT', 'REVIEW', 'CAMPAIGN', 'SOCIAL', 'OTHER');

-- CreateEnum
CREATE TYPE "WaiterStatus" AS ENUM ('ACTIVE', 'RESTING');

-- CreateEnum
CREATE TYPE "StaffContractType" AS ENUM ('TEMPO_DETERMINATO', 'TEMPO_INDETERMINATO', 'PART_TIME', 'FULL_TIME', 'STAGIONALE', 'APPRENDISTATO', 'COLLABORAZIONE', 'A_CHIAMATA', 'ALTRO');

-- CreateEnum
CREATE TYPE "StaffContractReminderType" AS ENUM ('DAYS_30', 'DAYS_15', 'DAYS_7', 'DUE_TODAY', 'EXPIRED');

-- CreateEnum
CREATE TYPE "StaffPrimaryRole" AS ENUM ('RESTAURANT_MANAGER', 'MAITRE', 'CHEF_DE_RANG', 'CAMERIERE', 'COMMIS_SALA', 'SOMMELIER', 'HEAD_SOMMELIER', 'RUNNER', 'BUSSER', 'HOST', 'BARTENDER');

-- CreateEnum
CREATE TYPE "StaffCapability" AS ENUM ('TABLE_RESPONSIBLE', 'TABLE_SUPPORT', 'SOMMELIER', 'RUNNER', 'BUSSER', 'ROOM_SUPERVISOR', 'SERVICE_MANAGER', 'MAITRE', 'HOST', 'BARTENDER');

-- CreateEnum
CREATE TYPE "AssignmentScope" AS ENUM ('SERVICE', 'ROOM', 'TABLE');

-- CreateEnum
CREATE TYPE "Plan" AS ENUM ('STARTER', 'GROWTH', 'ENTERPRISE');

-- CreateEnum
CREATE TYPE "OrgRole" AS ENUM ('OWNER', 'ADMIN', 'BILLING');

-- CreateEnum
CREATE TYPE "VenueKind" AS ENUM ('RESTAURANT', 'BEACH_CLUB', 'BAR', 'HOTEL_RESTAURANT', 'PRIVATE_CLUB');

-- CreateEnum
CREATE TYPE "BrandOnboardingStatus" AS ENUM ('NOT_STARTED', 'SKIPPED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "ServiceAssignmentMode" AS ENUM ('ROOMS', 'TABLES');

-- CreateEnum
CREATE TYPE "BrandTypography" AS ENUM ('ELEGANT', 'MODERN', 'CLASSIC', 'CASUAL');

-- CreateEnum
CREATE TYPE "StaffRole" AS ENUM ('MANAGER', 'RECEPTION', 'WAITER', 'MARKETING', 'READ_ONLY');

-- CreateEnum
CREATE TYPE "TableShape" AS ENUM ('ROUND', 'SQUARE', 'RECT', 'BOOTH', 'LOUNGE');

-- CreateEnum
CREATE TYPE "RoomLayoutMode" AS ENUM ('IMAGE', 'BUILDER');

-- CreateEnum
CREATE TYPE "LoyaltyTier" AS ENUM ('NEW', 'REGULAR', 'VIP', 'AMBASSADOR');

-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('CONFIRMED', 'PENDING', 'ARRIVED', 'SEATED', 'COMPLETED', 'CANCELLED', 'NO_SHOW');

-- CreateEnum
CREATE TYPE "BookingSource" AS ENUM ('WIDGET', 'PHONE', 'WALK_IN', 'GOOGLE', 'SOCIAL', 'CONCIERGE', 'EVENT');

-- CreateEnum
CREATE TYPE "Occasion" AS ENUM ('BIRTHDAY', 'ANNIVERSARY', 'BUSINESS', 'DATE', 'CELEBRATION', 'OTHER');

-- CreateEnum
CREATE TYPE "DepositStatus" AS ENUM ('NONE', 'HELD', 'CAPTURED', 'REFUNDED', 'FAILED');

-- CreateEnum
CREATE TYPE "TicketStatus" AS ENUM ('PAID', 'REFUNDED', 'CANCELLED', 'CHECKED_IN');

-- CreateEnum
CREATE TYPE "CampaignChannel" AS ENUM ('EMAIL', 'SMS', 'WHATSAPP');

-- CreateEnum
CREATE TYPE "CampaignStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'SENT', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "PaymentKind" AS ENUM ('DEPOSIT', 'PREAUTH', 'TICKET', 'REFUND', 'PACKAGE');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "AutomationRunStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'PARTIAL');

-- CreateEnum
CREATE TYPE "AutomationTrigger" AS ENUM ('BOOKING_CREATED', 'BOOKING_COMPLETED', 'GUEST_BIRTHDAY', 'GUEST_INACTIVE', 'COUPON_NOT_USED', 'NPS_DETRACTOR', 'WIFI_LEAD_CREATED', 'ORDER_COMPLETED', 'CUSTOM');

-- CreateEnum
CREATE TYPE "BookingEventKind" AS ENUM ('CREATED', 'STATUS_CHANGED', 'TABLE_CHANGED', 'TIME_CHANGED', 'PARTY_CHANGED', 'NOTES_UPDATED', 'DEPOSIT_PAID', 'DEPOSIT_FAILED', 'REMINDER_SENT', 'CONFIRMATION_SENT', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CallDirection" AS ENUM ('INBOUND', 'OUTBOUND');

-- CreateEnum
CREATE TYPE "CallStatus" AS ENUM ('QUEUED', 'RINGING', 'IN_PROGRESS', 'COMPLETED', 'MISSED', 'FAILED');

-- CreateEnum
CREATE TYPE "ChatRole" AS ENUM ('USER', 'BOT', 'STAFF');

-- CreateEnum
CREATE TYPE "ChatSource" AS ENUM ('WEB', 'WHATSAPP', 'SMS', 'WIDGET', 'VOICE');

-- CreateEnum
CREATE TYPE "ChatStatus" AS ENUM ('OPEN', 'CONVERTED', 'ABANDONED', 'HANDOFF');

-- CreateEnum
CREATE TYPE "ConnectorDirection" AS ENUM ('INBOUND', 'OUTBOUND');

-- CreateEnum
CREATE TYPE "ConnectorEventStatus" AS ENUM ('RECEIVED', 'PROCESSED', 'REJECTED', 'FAILED');

-- CreateEnum
CREATE TYPE "ConnectorKind" AS ENUM ('THEFORK', 'GOOGLE_RESERVE', 'BOOKING_COM', 'OPENTABLE', 'CUSTOM');

-- CreateEnum
CREATE TYPE "ConnectorStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED', 'ERROR');

-- CreateEnum
CREATE TYPE "ConsentChannel" AS ENUM ('EMAIL', 'SMS', 'WHATSAPP', 'MARKETING_GENERAL', 'PRIVACY', 'PROFILING');

-- CreateEnum
CREATE TYPE "CostCategory" AS ENUM ('FOOD', 'BEVERAGE', 'STAFF', 'RENT', 'UTILITIES', 'MARKETING', 'SUPPLIES', 'OTHER');

-- CreateEnum
CREATE TYPE "CouponCategory" AS ENUM ('GENERIC', 'BIRTHDAY', 'WINBACK', 'EVENT', 'NEW_CUSTOMER', 'WIFI', 'REFERRAL', 'STAFF');

-- CreateEnum
CREATE TYPE "CouponKind" AS ENUM ('PERCENT', 'FIXED', 'FREE_ITEM', 'MENU_OFFER');

-- CreateEnum
CREATE TYPE "CouponStatus" AS ENUM ('ACTIVE', 'PAUSED', 'EXPIRED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "DecorKind" AS ENUM ('PLANT', 'SOFA', 'ARMCHAIR', 'BAR', 'COUNTER', 'KITCHEN', 'DJ_BOOTH', 'STAGE', 'COLUMN', 'DIVIDER', 'DOOR', 'WINDOW', 'ENTRANCE', 'RESTROOM', 'POOL', 'STAIRS', 'RUG', 'LAMP', 'LABEL');

-- CreateEnum
CREATE TYPE "DraftStatus" AS ENUM ('NEW', 'CONFIRMED', 'REJECTED');

-- CreateEnum
CREATE TYPE "GiftCardStatus" AS ENUM ('PENDING_PAYMENT', 'ACTIVE', 'EXHAUSTED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "LoyaltyTxnKind" AS ENUM ('EARNED', 'REDEEMED', 'ADJUSTED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "MenuScanSource" AS ENUM ('QR', 'TABLE', 'WIDGET', 'LINK');

-- CreateEnum
CREATE TYPE "MessageChannel" AS ENUM ('EMAIL', 'SMS', 'WHATSAPP');

-- CreateEnum
CREATE TYPE "MessageStatus" AS ENUM ('QUEUED', 'SENT', 'DELIVERED', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "NotificationKind" AS ENUM ('BOOKING_CREATED', 'BOOKING_CANCELLED', 'NPS_DETRACTOR', 'WAITLIST_ACCEPTED', 'CONNECTOR_INBOUND', 'POS_INBOUND', 'AUTOMATION_FAILED', 'GIFT_CARD_REDEEMED', 'WIFI_LEAD', 'CHAT_HANDOFF', 'MISSED_CALL', 'REVIEW_RECEIVED', 'PLAN_LIMIT', 'GDPR_ANONYMIZE', 'PAYMENT_REFUND', 'AUTH_RECOVERY_LOW', 'CONNECTOR_ERROR', 'VIP_UNASSIGNED', 'STAFF_CONTRACT_EXPIRING', 'STAFF_CONTRACT_EXPIRED');

-- CreateEnum
CREATE TYPE "OrderKind" AS ENUM ('TAKEAWAY', 'DELIVERY', 'TABLE');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('RECEIVED', 'PREPARING', 'READY', 'ON_THE_WAY', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "POSConnectorKind" AS ENUM ('SQUARE', 'LIGHTSPEED', 'SUMUP', 'IZETTLE', 'TOAST', 'CUSTOM');

-- CreateEnum
CREATE TYPE "POSConnectorStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED', 'ERROR');

-- CreateEnum
CREATE TYPE "POSEventStatus" AS ENUM ('RECEIVED', 'PROCESSED', 'REJECTED', 'FAILED');

-- CreateEnum
CREATE TYPE "PreorderStatus" AS ENUM ('DRAFT', 'CONFIRMED', 'PREPARED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ReviewPlatform" AS ENUM ('GOOGLE', 'TRIPADVISOR', 'TRUSTPILOT', 'THEFORK', 'FACEBOOK', 'INSTAGRAM', 'YELP', 'OTHER');

-- CreateEnum
CREATE TYPE "ReviewSource" AS ENUM ('GOOGLE', 'TRIPADVISOR', 'FACEBOOK', 'YELP', 'TRUSTPILOT', 'MANUAL');

-- CreateEnum
CREATE TYPE "Sentiment" AS ENUM ('PROMOTER', 'PASSIVE', 'DETRACTOR');

-- CreateEnum
CREATE TYPE "TemplateCategory" AS ENUM ('GENERIC', 'WELCOME', 'REMINDER', 'THANK_YOU', 'PROMO', 'WIN_BACK', 'BIRTHDAY', 'ANNIVERSARY', 'EVENT');

-- CreateEnum
CREATE TYPE "WaitlistStatus" AS ENUM ('WAITING', 'NOTIFIED', 'SEATED', 'CANCELLED', 'NO_SHOW', 'OFFERED', 'CONFIRMED', 'EXPIRED', 'DECLINED');

-- CreateEnum
CREATE TYPE "AgentMessageRole" AS ENUM ('USER', 'ASSISTANT');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "passwordHash" TEXT,
    "image" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "totpEnabled" BOOLEAN NOT NULL DEFAULT false,
    "totpSecret" TEXT,
    "recoveryCodesHash" TEXT[] DEFAULT ARRAY[]::TEXT[],

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "plan" "Plan" NOT NULL DEFAULT 'STARTER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "baseCurrency" TEXT NOT NULL DEFAULT 'EUR',

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "org_membership" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "role" "OrgRole" NOT NULL DEFAULT 'OWNER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "org_membership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Venue" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "kind" "VenueKind" NOT NULL DEFAULT 'RESTAURANT',
    "timezone" TEXT NOT NULL DEFAULT 'Europe/Rome',
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "address" TEXT,
    "city" TEXT,
    "country" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "coverImage" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "depositPerPersonCents" INTEGER NOT NULL DEFAULT 2000,
    "depositThreshold" INTEGER NOT NULL DEFAULT 8,
    "wifiAutoCouponDays" INTEGER NOT NULL DEFAULT 30,
    "wifiAutoCouponEnabled" BOOLEAN NOT NULL DEFAULT false,
    "wifiAutoCouponPercent" INTEGER NOT NULL DEFAULT 10,
    "wifiPortalAccent" VARCHAR(9),
    "wifiPortalLegal" VARCHAR(2000),
    "wifiPortalLogoUrl" TEXT,
    "wifiPortalWelcome" VARCHAR(500),
    "wifiSetupAt" TIMESTAMP(3),
    "calendarToken" TEXT,
    "googlePlaceId" TEXT,
    "brevoFolderId" INTEGER,
    "brandAccent" VARCHAR(9),
    "brandFootnote" VARCHAR(280),
    "brandLogoUrl" TEXT,
    "brandSecondaryColor" VARCHAR(9),
    "brandBackgroundColor" VARCHAR(9),
    "brandTypography" "BrandTypography",
    "websiteUrl" TEXT,
    "instagramUrl" TEXT,
    "facebookUrl" TEXT,
    "googleBusinessUrl" TEXT,
    "onboardingStatus" "BrandOnboardingStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "onboardingCompletedAt" TIMESTAMP(3),
    "onboardingSkippedAt" TIMESTAMP(3),
    "serviceAssignmentMode" "ServiceAssignmentMode" NOT NULL DEFAULT 'ROOMS',

    CONSTRAINT "Venue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "venue_membership" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "role" "StaffRole" NOT NULL DEFAULT 'RECEPTION',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "venue_membership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Room" (
    "id" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "width" INTEGER NOT NULL DEFAULT 1200,
    "height" INTEGER NOT NULL DEFAULT 800,
    "ordering" INTEGER NOT NULL DEFAULT 0,
    "floorPlanUrl" TEXT,
    "activeLayoutMode" "RoomLayoutMode",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Room_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoomLayout" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'm',
    "pixelsPerMeter" INTEGER NOT NULL DEFAULT 100,
    "elements" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RoomLayout_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Table" (
    "id" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "roomId" TEXT,
    "label" TEXT NOT NULL,
    "seats" INTEGER NOT NULL DEFAULT 2,
    "shape" "TableShape" NOT NULL DEFAULT 'ROUND',
    "posX" INTEGER NOT NULL DEFAULT 0,
    "posY" INTEGER NOT NULL DEFAULT 0,
    "rotation" INTEGER NOT NULL DEFAULT 0,
    "combinable" BOOLEAN NOT NULL DEFAULT true,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "height" INTEGER,
    "width" INTEGER,

    CONSTRAINT "Table_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TableBlock" (
    "id" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "tableId" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "reason" TEXT,

    CONSTRAINT "TableBlock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Shift" (
    "id" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "weekday" INTEGER NOT NULL,
    "startMinute" INTEGER NOT NULL,
    "endMinute" INTEGER NOT NULL,
    "capacity" INTEGER NOT NULL DEFAULT 80,
    "slotMinutes" INTEGER NOT NULL DEFAULT 15,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Shift_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Guest" (
    "id" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "birthday" TIMESTAMP(3),
    "language" TEXT NOT NULL DEFAULT 'it',
    "loyaltyTier" "LoyaltyTier" NOT NULL DEFAULT 'NEW',
    "totalVisits" INTEGER NOT NULL DEFAULT 0,
    "totalSpend" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "noShowCount" INTEGER NOT NULL DEFAULT 0,
    "lastVisitAt" TIMESTAMP(3),
    "preferences" JSONB,
    "allergies" TEXT,
    "privateNotes" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "marketingOptIn" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "blocked" BOOLEAN NOT NULL DEFAULT false,
    "blockedAt" TIMESTAMP(3),
    "blockedReason" VARCHAR(400),
    "loyaltyPoints" INTEGER NOT NULL DEFAULT 0,
    "anonymizedAt" TIMESTAMP(3),
    "anonymizedBy" TEXT,

    CONSTRAINT "Guest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Booking" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "guestId" TEXT,
    "tableId" TEXT,
    "partySize" INTEGER NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "durationMin" INTEGER NOT NULL DEFAULT 105,
    "status" "BookingStatus" NOT NULL DEFAULT 'CONFIRMED',
    "source" "BookingSource" NOT NULL DEFAULT 'WIDGET',
    "occasion" "Occasion",
    "notes" TEXT,
    "internalNotes" TEXT,
    "depositCents" INTEGER NOT NULL DEFAULT 0,
    "depositStatus" "DepositStatus" NOT NULL DEFAULT 'NONE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "arrivedAt" TIMESTAMP(3),
    "seatedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "budgetCents" INTEGER,
    "eventType" VARCHAR(60),
    "isGroup" BOOLEAN NOT NULL DEFAULT false,
    "combinedTableIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "deletedAt" TIMESTAMP(3),
    "deletedBy" TEXT,

    CONSTRAINT "Booking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Experience" (
    "id" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "capacity" INTEGER NOT NULL DEFAULT 40,
    "priceCents" INTEGER NOT NULL DEFAULT 0,
    "ticketUrl" TEXT,
    "coverImage" TEXT,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Experience_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Ticket" (
    "id" TEXT NOT NULL,
    "experienceId" TEXT NOT NULL,
    "buyerName" TEXT NOT NULL,
    "buyerEmail" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "totalCents" INTEGER NOT NULL DEFAULT 0,
    "status" "TicketStatus" NOT NULL DEFAULT 'PAID',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "checkedInAt" TIMESTAMP(3),
    "checkedInBy" TEXT,

    CONSTRAINT "Ticket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Campaign" (
    "id" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "channel" "CampaignChannel" NOT NULL DEFAULT 'EMAIL',
    "segment" JSONB,
    "subject" TEXT,
    "body" TEXT,
    "contentBlocks" JSONB,
    "previewText" TEXT,
    "scheduledAt" TIMESTAMP(3),
    "status" "CampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "providerId" TEXT,
    "providerListId" INTEGER,
    "sentCount" INTEGER NOT NULL DEFAULT 0,
    "openedCount" INTEGER NOT NULL DEFAULT 0,
    "bookedCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QrCode" (
    "id" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "destinationUrl" TEXT NOT NULL,
    "category" "QrCodeCategory" NOT NULL DEFAULT 'OTHER',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "scansCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QrCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GuestProviderLink" (
    "id" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "guestId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerContactId" TEXT NOT NULL,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GuestProviderLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookEvent" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerEventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "WebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "bookingId" TEXT,
    "guestId" TEXT,
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "kind" "PaymentKind" NOT NULL DEFAULT 'DEPOSIT',
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "stripePaymentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "refundedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "deletedBy" TEXT,
    "fxAmountBaseCents" INTEGER,
    "fxBaseCurrency" VARCHAR(3),
    "fxRateToBase" DECIMAL(12,6),

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiToken" (
    "id" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "prefix" VARCHAR(16) NOT NULL,
    "hashedSecret" TEXT NOT NULL,
    "scopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "lastUsedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApiToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "venueId" TEXT,
    "orgId" TEXT NOT NULL,
    "actorId" TEXT,
    "actorEmail" TEXT,
    "action" VARCHAR(64) NOT NULL,
    "entityType" VARCHAR(32) NOT NULL,
    "entityId" TEXT,
    "diff" JSONB,
    "ip" VARCHAR(64),
    "userAgent" VARCHAR(255),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutomationRun" (
    "id" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "trigger" "AutomationTrigger" NOT NULL,
    "status" "AutomationRunStatus" NOT NULL DEFAULT 'QUEUED',
    "payload" JSONB,
    "result" JSONB,
    "error" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AutomationRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutomationWorkflow" (
    "id" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "trigger" "AutomationTrigger" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "conditions" JSONB,
    "actions" JSONB NOT NULL,
    "delayMinutes" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,

    CONSTRAINT "AutomationWorkflow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookingEvent" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "kind" "BookingEventKind" NOT NULL,
    "message" TEXT,
    "meta" JSONB,
    "actorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BookingEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookingPreorder" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "status" "PreorderStatus" NOT NULL DEFAULT 'DRAFT',
    "totalCents" INTEGER NOT NULL DEFAULT 0,
    "notes" VARCHAR(500),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BookingPreorder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookingPreorderItem" (
    "id" TEXT NOT NULL,
    "preorderId" TEXT NOT NULL,
    "menuItemId" TEXT,
    "name" TEXT NOT NULL,
    "priceCents" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "notes" VARCHAR(200),

    CONSTRAINT "BookingPreorderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CallLog" (
    "id" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "fromNumber" TEXT NOT NULL,
    "toNumber" TEXT,
    "direction" "CallDirection" NOT NULL DEFAULT 'INBOUND',
    "status" "CallStatus" NOT NULL DEFAULT 'QUEUED',
    "recordingUrl" TEXT,
    "transcript" TEXT,
    "durationSec" INTEGER,
    "intent" TEXT,
    "draftId" TEXT,
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CallLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatMessage" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "role" "ChatRole" NOT NULL,
    "text" TEXT NOT NULL,
    "intent" TEXT,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatSession" (
    "id" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "source" "ChatSource" NOT NULL DEFAULT 'WEB',
    "guestId" TEXT,
    "bookingId" TEXT,
    "status" "ChatStatus" NOT NULL DEFAULT 'OPEN',
    "draftPartySize" INTEGER,
    "draftDate" TEXT,
    "draftTime" TEXT,
    "draftFirstName" TEXT,
    "draftLastName" TEXT,
    "draftEmail" TEXT,
    "draftPhone" TEXT,
    "draftNotes" TEXT,
    "language" TEXT NOT NULL DEFAULT 'it',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChatSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Connector" (
    "id" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "kind" "ConnectorKind" NOT NULL,
    "label" TEXT,
    "status" "ConnectorStatus" NOT NULL DEFAULT 'DRAFT',
    "config" JSONB,
    "webhookSecret" TEXT,
    "externalRef" TEXT,
    "lastSyncAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Connector_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConnectorEvent" (
    "id" TEXT NOT NULL,
    "connectorId" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "direction" "ConnectorDirection" NOT NULL,
    "kind" TEXT NOT NULL,
    "status" "ConnectorEventStatus" NOT NULL DEFAULT 'RECEIVED',
    "payload" JSONB,
    "bookingId" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConnectorEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConsentLog" (
    "id" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "guestId" TEXT,
    "leadId" TEXT,
    "channel" "ConsentChannel" NOT NULL,
    "granted" BOOLEAN NOT NULL,
    "source" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConsentLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CostEntry" (
    "id" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "category" "CostCategory" NOT NULL,
    "label" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "occurredOn" TIMESTAMP(3) NOT NULL,
    "recurring" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,

    CONSTRAINT "CostEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Coupon" (
    "id" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "kind" "CouponKind" NOT NULL DEFAULT 'PERCENT',
    "value" INTEGER NOT NULL DEFAULT 0,
    "freeItem" TEXT,
    "category" "CouponCategory" NOT NULL DEFAULT 'GENERIC',
    "status" "CouponStatus" NOT NULL DEFAULT 'ACTIVE',
    "validFrom" TIMESTAMP(3),
    "validUntil" TIMESTAMP(3),
    "maxRedemptions" INTEGER,
    "maxPerGuest" INTEGER NOT NULL DEFAULT 1,
    "guestId" TEXT,
    "segment" JSONB,
    "redemptionCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Coupon_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CouponRedemption" (
    "id" TEXT NOT NULL,
    "couponId" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "guestId" TEXT,
    "bookingId" TEXT,
    "orderId" TEXT,
    "ticketId" TEXT,
    "amountCents" INTEGER,
    "notes" TEXT,
    "redeemedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "redeemedBy" TEXT,
    "deletedAt" TIMESTAMP(3),
    "deletedBy" TEXT,

    CONSTRAINT "CouponRedemption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExchangeRate" (
    "id" TEXT NOT NULL,
    "from" VARCHAR(3) NOT NULL,
    "to" VARCHAR(3) NOT NULL,
    "rate" DECIMAL(12,6) NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExchangeRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FloorDecor" (
    "id" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "roomId" TEXT,
    "kind" "DecorKind" NOT NULL,
    "label" TEXT,
    "posX" INTEGER NOT NULL DEFAULT 0,
    "posY" INTEGER NOT NULL DEFAULT 0,
    "width" INTEGER NOT NULL DEFAULT 80,
    "height" INTEGER NOT NULL DEFAULT 80,
    "rotation" INTEGER NOT NULL DEFAULT 0,
    "color" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FloorDecor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GiftCard" (
    "id" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "initialCents" INTEGER NOT NULL,
    "balanceCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "recipientName" TEXT,
    "recipientEmail" TEXT,
    "senderName" TEXT,
    "message" VARCHAR(500),
    "status" "GiftCardStatus" NOT NULL DEFAULT 'ACTIVE',
    "expiresAt" TIMESTAMP(3),
    "stripePaymentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,

    CONSTRAINT "GiftCard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GiftCardRedemption" (
    "id" TEXT NOT NULL,
    "giftCardId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "bookingId" TEXT,
    "orderId" TEXT,
    "reason" VARCHAR(200),
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GiftCardRedemption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoyaltyTransaction" (
    "id" TEXT NOT NULL,
    "guestId" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "kind" "LoyaltyTxnKind" NOT NULL,
    "points" INTEGER NOT NULL,
    "reason" VARCHAR(200),
    "bookingId" TEXT,
    "orderId" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoyaltyTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MenuCategory" (
    "id" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ordering" INTEGER NOT NULL DEFAULT 0,
    "menuKey" TEXT NOT NULL DEFAULT 'main',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MenuCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MenuItem" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "priceCents" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "available" BOOLEAN NOT NULL DEFAULT true,
    "ordering" INTEGER NOT NULL DEFAULT 0,
    "allergens" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "dietary" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "imageUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MenuItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MenuItemCost" (
    "id" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "menuItemId" TEXT NOT NULL,
    "costCents" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MenuItemCost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MenuScan" (
    "id" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "menuKey" TEXT NOT NULL DEFAULT 'main',
    "source" "MenuScanSource" NOT NULL DEFAULT 'QR',
    "ipHash" TEXT,
    "userAgent" TEXT,
    "guestId" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "consentMarketing" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MenuScan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MessageLog" (
    "id" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "campaignId" TEXT,
    "workflowRunId" TEXT,
    "guestId" TEXT,
    "channel" "MessageChannel" NOT NULL,
    "toAddress" TEXT NOT NULL,
    "subject" TEXT,
    "bodyPreview" TEXT,
    "status" "MessageStatus" NOT NULL DEFAULT 'QUEUED',
    "providerId" TEXT,
    "error" TEXT,
    "sentAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),
    "deletedBy" TEXT,

    CONSTRAINT "MessageLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MessageTemplate" (
    "id" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "channel" "CampaignChannel" NOT NULL DEFAULT 'EMAIL',
    "subject" TEXT,
    "body" TEXT NOT NULL,
    "category" "TemplateCategory" NOT NULL DEFAULT 'GENERIC',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MessageTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MissedCall" (
    "id" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "fromNumber" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 1,
    "callbackSentAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MissedCall_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "kind" "NotificationKind" NOT NULL,
    "title" VARCHAR(160) NOT NULL,
    "body" VARCHAR(500),
    "link" VARCHAR(300),
    "meta" JSONB,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "guestId" TEXT,
    "kind" "OrderKind" NOT NULL DEFAULT 'TAKEAWAY',
    "status" "OrderStatus" NOT NULL DEFAULT 'RECEIVED',
    "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "customerName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "address" TEXT,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "totalCents" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "notes" TEXT,
    "stripeId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "preparedAt" TIMESTAMP(3),
    "readyAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "tableLabel" VARCHAR(40),

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderItem" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "menuItemId" TEXT,
    "name" TEXT NOT NULL,
    "priceCents" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "notes" TEXT,

    CONSTRAINT "OrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "POSConnector" (
    "id" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "kind" "POSConnectorKind" NOT NULL,
    "label" TEXT,
    "status" "POSConnectorStatus" NOT NULL DEFAULT 'DRAFT',
    "config" JSONB,
    "webhookSecret" TEXT,
    "externalRef" TEXT,
    "lastSyncAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "POSConnector_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "POSEvent" (
    "id" TEXT NOT NULL,
    "posConnectorId" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "externalRef" TEXT,
    "action" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "payload" JSONB,
    "status" "POSEventStatus" NOT NULL DEFAULT 'RECEIVED',
    "orderId" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "POSEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Review" (
    "id" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "source" "ReviewSource" NOT NULL,
    "externalRef" TEXT,
    "externalUrl" TEXT,
    "rating" INTEGER NOT NULL,
    "authorName" VARCHAR(120),
    "authorAvatar" TEXT,
    "text" VARCHAR(2000),
    "language" TEXT NOT NULL DEFAULT 'it',
    "publishedAt" TIMESTAMP(3),
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Review_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReviewLink" (
    "id" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "platform" "ReviewPlatform" NOT NULL,
    "label" TEXT,
    "url" TEXT NOT NULL,
    "ordering" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReviewLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReviewLinkClick" (
    "id" TEXT NOT NULL,
    "linkId" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "surveyId" TEXT,
    "npsScore" INTEGER,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReviewLinkClick_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Waiter" (
    "id" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "birthday" TIMESTAMP(3) NOT NULL,
    "phone" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "primaryRole" "StaffPrimaryRole",
    "capabilities" "StaffCapability"[] DEFAULT ARRAY[]::"StaffCapability"[],
    "status" "WaiterStatus" NOT NULL DEFAULT 'ACTIVE',
    "photoUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Waiter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffContract" (
    "id" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "waiterId" TEXT NOT NULL,
    "contractType" "StaffContractType" NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "weeklyHours" DOUBLE PRECISION,
    "contractualRole" TEXT,
    "notes" VARCHAR(2000),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StaffContract_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContractDocument" (
    "id" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "originalFileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "uploadedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContractDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffContractReminder" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "reminderType" "StaffContractReminderType" NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StaffContractReminder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WaiterAssignment" (
    "id" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "waiterId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "service" TEXT NOT NULL,
    "assignmentMode" "ServiceAssignmentMode" NOT NULL,
    "roomId" TEXT,
    "tableIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WaiterAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffAssignment" (
    "id" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "waiterId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "service" TEXT NOT NULL,
    "scope" "AssignmentScope" NOT NULL,
    "roomId" TEXT,
    "tableId" TEXT,
    "assignmentType" "StaffCapability" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StaffAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffShift" (
    "id" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "staffName" TEXT NOT NULL,
    "role" TEXT,
    "date" TIMESTAMP(3) NOT NULL,
    "hours" DOUBLE PRECISION NOT NULL DEFAULT 8,
    "hourlyCents" INTEGER NOT NULL DEFAULT 1200,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StaffShift_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Survey" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "bookingId" TEXT,
    "guestId" TEXT,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respondedAt" TIMESTAMP(3),

    CONSTRAINT "Survey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SurveyResponse" (
    "id" TEXT NOT NULL,
    "surveyId" TEXT NOT NULL,
    "npsScore" INTEGER NOT NULL,
    "sentiment" "Sentiment" NOT NULL,
    "comment" TEXT,
    "recommend" BOOLEAN,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SurveyResponse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VoiceBookingDraft" (
    "id" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "callerName" TEXT,
    "phone" TEXT,
    "partySize" INTEGER,
    "preferredDate" TEXT,
    "preferredTime" TEXT,
    "notes" TEXT,
    "status" "DraftStatus" NOT NULL DEFAULT 'NEW',
    "bookingId" TEXT,
    "reviewedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VoiceBookingDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WaitlistEntry" (
    "id" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "guestId" TEXT,
    "guestName" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "partySize" INTEGER NOT NULL,
    "expectedWaitMin" INTEGER NOT NULL DEFAULT 20,
    "status" "WaitlistStatus" NOT NULL DEFAULT 'WAITING',
    "notifiedAt" TIMESTAMP(3),
    "seatedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "position" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "confirmedAt" TIMESTAMP(3),
    "convertedBookingId" TEXT,
    "declinedAt" TIMESTAMP(3),
    "offerExpiresAt" TIMESTAMP(3),
    "offerSentVia" VARCHAR(20),
    "offerToken" TEXT,

    CONSTRAINT "WaitlistEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WifiLead" (
    "id" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "guestId" TEXT,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "source" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "consentMarketing" BOOLEAN NOT NULL DEFAULT false,
    "consentPrivacy" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WifiLead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WifiSession" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "durationSec" INTEGER,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "deviceType" TEXT,

    CONSTRAINT "WifiSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentConversation" (
    "id" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentConversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentMessage" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "role" "AgentMessageRole" NOT NULL,
    "content" TEXT NOT NULL,
    "structured" JSONB,
    "source" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentUsage" (
    "id" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "yearMonth" TEXT NOT NULL,
    "llmRequestCount" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentUsage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Session_sessionToken_key" ON "Session"("sessionToken");

-- CreateIndex
CREATE UNIQUE INDEX "Organization_slug_key" ON "Organization"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "org_membership_userId_orgId_key" ON "org_membership"("userId", "orgId");

-- CreateIndex
CREATE UNIQUE INDEX "Venue_calendarToken_key" ON "Venue"("calendarToken");

-- CreateIndex
CREATE UNIQUE INDEX "Venue_orgId_slug_key" ON "Venue"("orgId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "venue_membership_userId_venueId_key" ON "venue_membership"("userId", "venueId");

-- CreateIndex
CREATE INDEX "Room_venueId_ordering_idx" ON "Room"("venueId", "ordering");

-- CreateIndex
CREATE UNIQUE INDEX "RoomLayout_roomId_key" ON "RoomLayout"("roomId");

-- CreateIndex
CREATE UNIQUE INDEX "Table_venueId_label_key" ON "Table"("venueId", "label");

-- CreateIndex
CREATE INDEX "Guest_venueId_email_idx" ON "Guest"("venueId", "email");

-- CreateIndex
CREATE INDEX "Guest_venueId_phone_idx" ON "Guest"("venueId", "phone");

-- CreateIndex
CREATE INDEX "Guest_venueId_lastName_idx" ON "Guest"("venueId", "lastName");

-- CreateIndex
CREATE UNIQUE INDEX "Booking_reference_key" ON "Booking"("reference");

-- CreateIndex
CREATE INDEX "Booking_venueId_startsAt_idx" ON "Booking"("venueId", "startsAt");

-- CreateIndex
CREATE INDEX "Booking_venueId_status_idx" ON "Booking"("venueId", "status");

-- CreateIndex
CREATE INDEX "Booking_venueId_deletedAt_idx" ON "Booking"("venueId", "deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Experience_venueId_slug_key" ON "Experience"("venueId", "slug");

-- CreateIndex
CREATE INDEX "QrCode_venueId_createdAt_idx" ON "QrCode"("venueId", "createdAt");

-- CreateIndex
CREATE INDEX "GuestProviderLink_venueId_provider_idx" ON "GuestProviderLink"("venueId", "provider");

-- CreateIndex
CREATE UNIQUE INDEX "GuestProviderLink_guestId_provider_key" ON "GuestProviderLink"("guestId", "provider");

-- CreateIndex
CREATE UNIQUE INDEX "WebhookEvent_provider_providerEventId_key" ON "WebhookEvent"("provider", "providerEventId");

-- CreateIndex
CREATE INDEX "Payment_venueId_createdAt_idx" ON "Payment"("venueId", "createdAt");

-- CreateIndex
CREATE INDEX "Payment_venueId_deletedAt_idx" ON "Payment"("venueId", "deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ApiToken_prefix_key" ON "ApiToken"("prefix");

-- CreateIndex
CREATE INDEX "ApiToken_venueId_revokedAt_idx" ON "ApiToken"("venueId", "revokedAt");

-- CreateIndex
CREATE INDEX "AuditLog_actorId_createdAt_idx" ON "AuditLog"("actorId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_orgId_createdAt_idx" ON "AuditLog"("orgId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_venueId_createdAt_idx" ON "AuditLog"("venueId", "createdAt");

-- CreateIndex
CREATE INDEX "AutomationRun_venueId_createdAt_idx" ON "AutomationRun"("venueId", "createdAt");

-- CreateIndex
CREATE INDEX "AutomationRun_workflowId_createdAt_idx" ON "AutomationRun"("workflowId", "createdAt");

-- CreateIndex
CREATE INDEX "AutomationWorkflow_venueId_trigger_active_idx" ON "AutomationWorkflow"("venueId", "trigger", "active");

-- CreateIndex
CREATE INDEX "BookingEvent_bookingId_createdAt_idx" ON "BookingEvent"("bookingId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "BookingPreorder_bookingId_key" ON "BookingPreorder"("bookingId");

-- CreateIndex
CREATE INDEX "BookingPreorderItem_preorderId_idx" ON "BookingPreorderItem"("preorderId");

-- CreateIndex
CREATE UNIQUE INDEX "CallLog_draftId_key" ON "CallLog"("draftId");

-- CreateIndex
CREATE INDEX "CallLog_venueId_createdAt_idx" ON "CallLog"("venueId", "createdAt");

-- CreateIndex
CREATE INDEX "ChatMessage_sessionId_createdAt_idx" ON "ChatMessage"("sessionId", "createdAt");

-- CreateIndex
CREATE INDEX "ChatSession_venueId_createdAt_idx" ON "ChatSession"("venueId", "createdAt");

-- CreateIndex
CREATE INDEX "Connector_venueId_status_idx" ON "Connector"("venueId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Connector_venueId_kind_key" ON "Connector"("venueId", "kind");

-- CreateIndex
CREATE INDEX "ConnectorEvent_connectorId_createdAt_idx" ON "ConnectorEvent"("connectorId", "createdAt");

-- CreateIndex
CREATE INDEX "ConnectorEvent_venueId_createdAt_idx" ON "ConnectorEvent"("venueId", "createdAt");

-- CreateIndex
CREATE INDEX "ConsentLog_guestId_idx" ON "ConsentLog"("guestId");

-- CreateIndex
CREATE INDEX "ConsentLog_venueId_channel_createdAt_idx" ON "ConsentLog"("venueId", "channel", "createdAt");

-- CreateIndex
CREATE INDEX "CostEntry_venueId_occurredOn_idx" ON "CostEntry"("venueId", "occurredOn");

-- CreateIndex
CREATE UNIQUE INDEX "Coupon_code_key" ON "Coupon"("code");

-- CreateIndex
CREATE INDEX "Coupon_venueId_category_idx" ON "Coupon"("venueId", "category");

-- CreateIndex
CREATE INDEX "Coupon_venueId_status_idx" ON "Coupon"("venueId", "status");

-- CreateIndex
CREATE INDEX "CouponRedemption_couponId_idx" ON "CouponRedemption"("couponId");

-- CreateIndex
CREATE INDEX "CouponRedemption_guestId_redeemedAt_idx" ON "CouponRedemption"("guestId", "redeemedAt");

-- CreateIndex
CREATE INDEX "CouponRedemption_venueId_deletedAt_idx" ON "CouponRedemption"("venueId", "deletedAt");

-- CreateIndex
CREATE INDEX "CouponRedemption_venueId_redeemedAt_idx" ON "CouponRedemption"("venueId", "redeemedAt");

-- CreateIndex
CREATE INDEX "ExchangeRate_from_to_idx" ON "ExchangeRate"("from", "to");

-- CreateIndex
CREATE UNIQUE INDEX "ExchangeRate_from_to_fetchedAt_key" ON "ExchangeRate"("from", "to", "fetchedAt");

-- CreateIndex
CREATE INDEX "FloorDecor_venueId_idx" ON "FloorDecor"("venueId");

-- CreateIndex
CREATE UNIQUE INDEX "GiftCard_code_key" ON "GiftCard"("code");

-- CreateIndex
CREATE INDEX "GiftCard_venueId_status_idx" ON "GiftCard"("venueId", "status");

-- CreateIndex
CREATE INDEX "GiftCardRedemption_giftCardId_createdAt_idx" ON "GiftCardRedemption"("giftCardId", "createdAt");

-- CreateIndex
CREATE INDEX "LoyaltyTransaction_guestId_createdAt_idx" ON "LoyaltyTransaction"("guestId", "createdAt");

-- CreateIndex
CREATE INDEX "LoyaltyTransaction_venueId_createdAt_idx" ON "LoyaltyTransaction"("venueId", "createdAt");

-- CreateIndex
CREATE INDEX "MenuCategory_venueId_menuKey_ordering_idx" ON "MenuCategory"("venueId", "menuKey", "ordering");

-- CreateIndex
CREATE INDEX "MenuItem_categoryId_ordering_idx" ON "MenuItem"("categoryId", "ordering");

-- CreateIndex
CREATE UNIQUE INDEX "MenuItemCost_menuItemId_key" ON "MenuItemCost"("menuItemId");

-- CreateIndex
CREATE INDEX "MenuItemCost_venueId_idx" ON "MenuItemCost"("venueId");

-- CreateIndex
CREATE INDEX "MenuScan_venueId_createdAt_idx" ON "MenuScan"("venueId", "createdAt");

-- CreateIndex
CREATE INDEX "MessageLog_campaignId_idx" ON "MessageLog"("campaignId");

-- CreateIndex
CREATE INDEX "MessageLog_guestId_channel_idx" ON "MessageLog"("guestId", "channel");

-- CreateIndex
CREATE INDEX "MessageLog_venueId_createdAt_idx" ON "MessageLog"("venueId", "createdAt");

-- CreateIndex
CREATE INDEX "MessageLog_venueId_deletedAt_idx" ON "MessageLog"("venueId", "deletedAt");

-- CreateIndex
CREATE INDEX "MessageTemplate_venueId_category_idx" ON "MessageTemplate"("venueId", "category");

-- CreateIndex
CREATE UNIQUE INDEX "MessageTemplate_venueId_name_key" ON "MessageTemplate"("venueId", "name");

-- CreateIndex
CREATE INDEX "MissedCall_venueId_createdAt_idx" ON "MissedCall"("venueId", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_venueId_createdAt_idx" ON "Notification"("venueId", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_venueId_readAt_idx" ON "Notification"("venueId", "readAt");

-- CreateIndex
CREATE UNIQUE INDEX "Order_reference_key" ON "Order"("reference");

-- CreateIndex
CREATE INDEX "Order_venueId_createdAt_idx" ON "Order"("venueId", "createdAt");

-- CreateIndex
CREATE INDEX "Order_venueId_status_scheduledAt_idx" ON "Order"("venueId", "status", "scheduledAt");

-- CreateIndex
CREATE INDEX "OrderItem_orderId_idx" ON "OrderItem"("orderId");

-- CreateIndex
CREATE INDEX "POSConnector_venueId_status_idx" ON "POSConnector"("venueId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "POSConnector_venueId_kind_key" ON "POSConnector"("venueId", "kind");

-- CreateIndex
CREATE INDEX "POSEvent_posConnectorId_createdAt_idx" ON "POSEvent"("posConnectorId", "createdAt");

-- CreateIndex
CREATE INDEX "POSEvent_venueId_createdAt_idx" ON "POSEvent"("venueId", "createdAt");

-- CreateIndex
CREATE INDEX "Review_venueId_publishedAt_idx" ON "Review"("venueId", "publishedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Review_venueId_source_externalRef_key" ON "Review"("venueId", "source", "externalRef");

-- CreateIndex
CREATE INDEX "ReviewLink_venueId_active_ordering_idx" ON "ReviewLink"("venueId", "active", "ordering");

-- CreateIndex
CREATE INDEX "ReviewLinkClick_linkId_createdAt_idx" ON "ReviewLinkClick"("linkId", "createdAt");

-- CreateIndex
CREATE INDEX "ReviewLinkClick_venueId_createdAt_idx" ON "ReviewLinkClick"("venueId", "createdAt");

-- CreateIndex
CREATE INDEX "Waiter_venueId_createdAt_idx" ON "Waiter"("venueId", "createdAt");

-- CreateIndex
CREATE INDEX "StaffContract_venueId_waiterId_startDate_idx" ON "StaffContract"("venueId", "waiterId", "startDate");

-- CreateIndex
CREATE INDEX "StaffContract_venueId_endDate_idx" ON "StaffContract"("venueId", "endDate");

-- CreateIndex
CREATE UNIQUE INDEX "ContractDocument_contractId_key" ON "ContractDocument"("contractId");

-- CreateIndex
CREATE INDEX "ContractDocument_venueId_idx" ON "ContractDocument"("venueId");

-- CreateIndex
CREATE UNIQUE INDEX "StaffContractReminder_contractId_reminderType_key" ON "StaffContractReminder"("contractId", "reminderType");

-- CreateIndex
CREATE INDEX "WaiterAssignment_venueId_date_service_idx" ON "WaiterAssignment"("venueId", "date", "service");

-- CreateIndex
CREATE UNIQUE INDEX "WaiterAssignment_waiterId_date_service_key" ON "WaiterAssignment"("waiterId", "date", "service");

-- CreateIndex
CREATE INDEX "StaffAssignment_venueId_date_service_scope_idx" ON "StaffAssignment"("venueId", "date", "service", "scope");

-- CreateIndex
CREATE INDEX "StaffAssignment_waiterId_date_service_idx" ON "StaffAssignment"("waiterId", "date", "service");

-- CreateIndex
CREATE UNIQUE INDEX "StaffAssignment_tableId_date_service_assignmentType_key" ON "StaffAssignment"("tableId", "date", "service", "assignmentType");

-- CreateIndex
CREATE INDEX "StaffShift_venueId_date_idx" ON "StaffShift"("venueId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "Survey_token_key" ON "Survey"("token");

-- CreateIndex
CREATE UNIQUE INDEX "Survey_bookingId_key" ON "Survey"("bookingId");

-- CreateIndex
CREATE INDEX "Survey_venueId_sentAt_idx" ON "Survey"("venueId", "sentAt");

-- CreateIndex
CREATE UNIQUE INDEX "SurveyResponse_surveyId_key" ON "SurveyResponse"("surveyId");

-- CreateIndex
CREATE INDEX "SurveyResponse_createdAt_idx" ON "SurveyResponse"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "VoiceBookingDraft_bookingId_key" ON "VoiceBookingDraft"("bookingId");

-- CreateIndex
CREATE INDEX "VoiceBookingDraft_venueId_createdAt_idx" ON "VoiceBookingDraft"("venueId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "WaitlistEntry_offerToken_key" ON "WaitlistEntry"("offerToken");

-- CreateIndex
CREATE INDEX "WaitlistEntry_venueId_status_createdAt_idx" ON "WaitlistEntry"("venueId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "WifiLead_venueId_createdAt_idx" ON "WifiLead"("venueId", "createdAt");

-- CreateIndex
CREATE INDEX "WifiLead_venueId_email_idx" ON "WifiLead"("venueId", "email");

-- CreateIndex
CREATE INDEX "WifiLead_venueId_phone_idx" ON "WifiLead"("venueId", "phone");

-- CreateIndex
CREATE INDEX "WifiSession_venueId_startedAt_idx" ON "WifiSession"("venueId", "startedAt");

-- CreateIndex
CREATE INDEX "AgentConversation_venueId_userId_updatedAt_idx" ON "AgentConversation"("venueId", "userId", "updatedAt");

-- CreateIndex
CREATE INDEX "AgentMessage_conversationId_createdAt_idx" ON "AgentMessage"("conversationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AgentUsage_venueId_yearMonth_key" ON "AgentUsage"("venueId", "yearMonth");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "org_membership" ADD CONSTRAINT "org_membership_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "org_membership" ADD CONSTRAINT "org_membership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Venue" ADD CONSTRAINT "Venue_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "venue_membership" ADD CONSTRAINT "venue_membership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "venue_membership" ADD CONSTRAINT "venue_membership_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Room" ADD CONSTRAINT "Room_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoomLayout" ADD CONSTRAINT "RoomLayout_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Table" ADD CONSTRAINT "Table_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Table" ADD CONSTRAINT "Table_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TableBlock" ADD CONSTRAINT "TableBlock_tableId_fkey" FOREIGN KEY ("tableId") REFERENCES "Table"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TableBlock" ADD CONSTRAINT "TableBlock_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shift" ADD CONSTRAINT "Shift_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Guest" ADD CONSTRAINT "Guest_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_guestId_fkey" FOREIGN KEY ("guestId") REFERENCES "Guest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_tableId_fkey" FOREIGN KEY ("tableId") REFERENCES "Table"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Experience" ADD CONSTRAINT "Experience_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_experienceId_fkey" FOREIGN KEY ("experienceId") REFERENCES "Experience"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QrCode" ADD CONSTRAINT "QrCode_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuestProviderLink" ADD CONSTRAINT "GuestProviderLink_guestId_fkey" FOREIGN KEY ("guestId") REFERENCES "Guest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuestProviderLink" ADD CONSTRAINT "GuestProviderLink_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_guestId_fkey" FOREIGN KEY ("guestId") REFERENCES "Guest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApiToken" ADD CONSTRAINT "ApiToken_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutomationRun" ADD CONSTRAINT "AutomationRun_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "AutomationWorkflow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutomationWorkflow" ADD CONSTRAINT "AutomationWorkflow_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingEvent" ADD CONSTRAINT "BookingEvent_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingPreorder" ADD CONSTRAINT "BookingPreorder_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingPreorderItem" ADD CONSTRAINT "BookingPreorderItem_preorderId_fkey" FOREIGN KEY ("preorderId") REFERENCES "BookingPreorder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CallLog" ADD CONSTRAINT "CallLog_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "VoiceBookingDraft"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CallLog" ADD CONSTRAINT "CallLog_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ChatSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatSession" ADD CONSTRAINT "ChatSession_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Connector" ADD CONSTRAINT "Connector_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConnectorEvent" ADD CONSTRAINT "ConnectorEvent_connectorId_fkey" FOREIGN KEY ("connectorId") REFERENCES "Connector"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsentLog" ADD CONSTRAINT "ConsentLog_guestId_fkey" FOREIGN KEY ("guestId") REFERENCES "Guest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsentLog" ADD CONSTRAINT "ConsentLog_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CostEntry" ADD CONSTRAINT "CostEntry_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Coupon" ADD CONSTRAINT "Coupon_guestId_fkey" FOREIGN KEY ("guestId") REFERENCES "Guest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Coupon" ADD CONSTRAINT "Coupon_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CouponRedemption" ADD CONSTRAINT "CouponRedemption_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "Coupon"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CouponRedemption" ADD CONSTRAINT "CouponRedemption_guestId_fkey" FOREIGN KEY ("guestId") REFERENCES "Guest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CouponRedemption" ADD CONSTRAINT "CouponRedemption_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FloorDecor" ADD CONSTRAINT "FloorDecor_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FloorDecor" ADD CONSTRAINT "FloorDecor_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GiftCard" ADD CONSTRAINT "GiftCard_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GiftCardRedemption" ADD CONSTRAINT "GiftCardRedemption_giftCardId_fkey" FOREIGN KEY ("giftCardId") REFERENCES "GiftCard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoyaltyTransaction" ADD CONSTRAINT "LoyaltyTransaction_guestId_fkey" FOREIGN KEY ("guestId") REFERENCES "Guest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MenuCategory" ADD CONSTRAINT "MenuCategory_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MenuItem" ADD CONSTRAINT "MenuItem_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "MenuCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MenuItem" ADD CONSTRAINT "MenuItem_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MenuItemCost" ADD CONSTRAINT "MenuItemCost_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MenuScan" ADD CONSTRAINT "MenuScan_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageLog" ADD CONSTRAINT "MessageLog_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageLog" ADD CONSTRAINT "MessageLog_guestId_fkey" FOREIGN KEY ("guestId") REFERENCES "Guest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageLog" ADD CONSTRAINT "MessageLog_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageLog" ADD CONSTRAINT "MessageLog_workflowRunId_fkey" FOREIGN KEY ("workflowRunId") REFERENCES "AutomationRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageTemplate" ADD CONSTRAINT "MessageTemplate_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MissedCall" ADD CONSTRAINT "MissedCall_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_guestId_fkey" FOREIGN KEY ("guestId") REFERENCES "Guest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_menuItemId_fkey" FOREIGN KEY ("menuItemId") REFERENCES "MenuItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "POSConnector" ADD CONSTRAINT "POSConnector_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "POSEvent" ADD CONSTRAINT "POSEvent_posConnectorId_fkey" FOREIGN KEY ("posConnectorId") REFERENCES "POSConnector"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewLink" ADD CONSTRAINT "ReviewLink_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewLinkClick" ADD CONSTRAINT "ReviewLinkClick_linkId_fkey" FOREIGN KEY ("linkId") REFERENCES "ReviewLink"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewLinkClick" ADD CONSTRAINT "ReviewLinkClick_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Waiter" ADD CONSTRAINT "Waiter_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffContract" ADD CONSTRAINT "StaffContract_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffContract" ADD CONSTRAINT "StaffContract_waiterId_fkey" FOREIGN KEY ("waiterId") REFERENCES "Waiter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractDocument" ADD CONSTRAINT "ContractDocument_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractDocument" ADD CONSTRAINT "ContractDocument_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "StaffContract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffContractReminder" ADD CONSTRAINT "StaffContractReminder_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "StaffContract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaiterAssignment" ADD CONSTRAINT "WaiterAssignment_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaiterAssignment" ADD CONSTRAINT "WaiterAssignment_waiterId_fkey" FOREIGN KEY ("waiterId") REFERENCES "Waiter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaiterAssignment" ADD CONSTRAINT "WaiterAssignment_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffAssignment" ADD CONSTRAINT "StaffAssignment_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffAssignment" ADD CONSTRAINT "StaffAssignment_waiterId_fkey" FOREIGN KEY ("waiterId") REFERENCES "Waiter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffAssignment" ADD CONSTRAINT "StaffAssignment_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffAssignment" ADD CONSTRAINT "StaffAssignment_tableId_fkey" FOREIGN KEY ("tableId") REFERENCES "Table"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffShift" ADD CONSTRAINT "StaffShift_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Survey" ADD CONSTRAINT "Survey_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SurveyResponse" ADD CONSTRAINT "SurveyResponse_surveyId_fkey" FOREIGN KEY ("surveyId") REFERENCES "Survey"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VoiceBookingDraft" ADD CONSTRAINT "VoiceBookingDraft_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaitlistEntry" ADD CONSTRAINT "WaitlistEntry_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WifiLead" ADD CONSTRAINT "WifiLead_guestId_fkey" FOREIGN KEY ("guestId") REFERENCES "Guest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WifiLead" ADD CONSTRAINT "WifiLead_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WifiSession" ADD CONSTRAINT "WifiSession_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "WifiLead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WifiSession" ADD CONSTRAINT "WifiSession_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentConversation" ADD CONSTRAINT "AgentConversation_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentConversation" ADD CONSTRAINT "AgentConversation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentMessage" ADD CONSTRAINT "AgentMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "AgentConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentUsage" ADD CONSTRAINT "AgentUsage_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

