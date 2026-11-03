import { demoServicesService } from "@/demo/services2";
import { searchWords } from "@/domain/shop";
import type { ModCategoryId } from "@/domain/validation/build";
import { mapError, type MappedError } from "@/features/auth/errors";
import { config } from "@/services/config";
import { getSupabase } from "@/services/supabase/client";
import type {
  BusinessInput,
  BusinessRequest,
  BusinessRow,
  BusinessServiceRow,
  MyServiceRequest,
  OfferMessage,
  PublicBusiness,
  PublicBusinessService,
  ServiceInput,
  ServiceRequestDetail,
  ServiceRequestStatus,
} from "@/services/supabase/database.types";

/**
 * Services (D-57): business pages, their service menus, and quote/booking requests with a private chat. One
 * page per account, who may answer a request, blocks, mutes and moderation are enforced by the database.
 */
export type Result<T = void> = { ok: true; data: T } | { ok: false; error: MappedError };
export type BusinessQuery = { query?: string; category?: ModCategoryId | null; page?: number };
export type NewRequest = { serviceId: string; vehicle: string | null; date: string | null; message: string };

async function run<T>(fn: () => Promise<T>): Promise<Result<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (e) {
    return { ok: false, error: mapError(e) };
  }
}
function sb() {
  const c = getSupabase();
  if (!c) throw new Error("not_configured");
  return c;
}
function must<T>(res: { data: T; error: unknown }): T {
  if (res.error) throw res.error;
  return res.data;
}
const PAGE = 20;

const realServicesService = {
  browse: ({ query = "", category = null, page = 0 }: BusinessQuery) =>
    run(async () => {
      let req = sb().from("public_businesses").select("*");
      if (category) req = req.contains("specialties", [category]);
      // words are letters and digits only, so they're safe inside the filter
      for (const w of searchWords(query)) req = req.or(`name.ilike.%${w}%,location_text.ilike.%${w}%`);
      return must(
        await req
          .order("verified", { ascending: false })
          .order("jobs_completed", { ascending: false })
          .order("created_at", { ascending: false })
          .range(page * PAGE, page * PAGE + PAGE - 1),
      ) as PublicBusiness[];
    }),
  business: (id: string) =>
    run(
      async () =>
        must(
          await sb().from("public_businesses").select("*").eq("business_id", id).maybeSingle(),
        ) as PublicBusiness | null,
    ),
  services: (businessId: string) =>
    run(
      async () =>
        must(
          await sb().from("public_business_services").select("*").eq("business_id", businessId).order("name"),
        ) as PublicBusinessService[],
    ),
  /** Your own business page (any state the server lets you see), or null. */
  myBusiness: () =>
    run(async () => must(await sb().from("businesses").select("*").maybeSingle()) as BusinessRow | null),
  myServices: () =>
    run(async () => must(await sb().from("business_services").select("*").order("name")) as BusinessServiceRow[]),
  createBusiness: (input: BusinessInput) =>
    run(async () => (must(await sb().from("businesses").insert(input).select("id").single()) as { id: string }).id),
  updateBusiness: (id: string, input: BusinessInput) =>
    run(async () => {
      must(await sb().from("businesses").update(input).eq("id", id).select("id").single());
    }),
  deleteBusiness: (id: string) =>
    run(async () => {
      must(await sb().rpc("soft_delete_business", { p_business: id }));
    }),
  addService: (businessId: string, input: ServiceInput) =>
    run(async () => {
      must(
        await sb()
          .from("business_services")
          .insert({ business_id: businessId, ...input })
          .select("id")
          .single(),
      );
    }),
  updateService: (id: string, input: ServiceInput) =>
    run(async () => {
      must(await sb().from("business_services").update(input).eq("id", id).select("id").single());
    }),
  deleteService: (id: string) =>
    run(async () => {
      must(await sb().rpc("soft_delete_business_service", { p_service: id }));
    }),
  request: (r: NewRequest) =>
    run(
      async () =>
        must(
          await sb().rpc("request_service", {
            p_service: r.serviceId,
            p_vehicle: r.vehicle,
            p_date: r.date,
            p_message: r.message,
          }),
        ) as string,
    ),
  myRequests: () => run(async () => must(await sb().rpc("my_service_requests")) as MyServiceRequest[]),
  businessRequests: () => run(async () => must(await sb().rpc("business_requests")) as BusinessRequest[]),
  requestDetail: (id: string) =>
    run(
      async () =>
        ((must(await sb().rpc("service_request", { p_request: id })) as ServiceRequestDetail[])[0] ??
          null) as ServiceRequestDetail | null,
    ),
  setStatus: (id: string, status: ServiceRequestStatus) =>
    run(async () => {
      must(await sb().rpc("set_request_status", { p_request: id, p_status: status }));
    }),
  thread: (id: string) => run(async () => must(await sb().rpc("request_thread", { p_request: id })) as OfferMessage[]),
  send: (id: string, body: string) =>
    run(async () => {
      must(await sb().rpc("send_request_message", { p_request: id, p_body: body }));
    }),
};

export type ServicesServiceApi = typeof realServicesService;
export const servicesService: ServicesServiceApi = config.demoMode ? demoServicesService : realServicesService;
