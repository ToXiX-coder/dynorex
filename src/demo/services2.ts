import { matchesBusiness, MAX_SERVICES, requestDateOk, sortBusinesses } from "@/domain/services";
import { searchWords } from "@/domain/shop";
import type { ServicesServiceApi } from "@/features/paddock/servicesService";
import type {
  BusinessRow,
  BusinessServiceRow,
  PublicBusiness,
  PublicBusinessService,
} from "@/services/supabase/database.types";
import { DEMO_ME, type DemoServiceRequest } from "./data";
import { demoKit as K } from "./services";

/** Pitch-mode Services: the same rules as migration 20261019000000_business_services.sql, on sample data. */
const S = () => K.state();
const now = () => new Date().toISOString();
const live = (r: DemoServiceRequest) => r.status === "open" || r.status === "accepted";
const liveServices = (businessId: string) =>
  S().businessServices.filter((s) => s.business_id === businessId && !s.deleted_at);

function publicBusiness(b: BusinessRow): PublicBusiness | null {
  const owner = K.userById(b.owner_id);
  if (b.deleted_at || !owner?.username || K.blockedWith(b.owner_id) || K.muted(b.owner_id)) return null;
  return {
    business_id: b.id,
    owner_username: owner.username,
    name: b.name,
    about: b.about,
    location_text: b.location_text,
    website: b.website,
    phone: b.phone,
    specialties: b.specialties,
    verified: owner.business_badge,
    created_at: b.created_at,
    services_count: liveServices(b.id).length,
    jobs_completed: S().serviceRequests.filter((r) => r.business_id === b.id && r.status === "completed").length,
  };
}
const toPublicService = (s: BusinessServiceRow): PublicBusinessService => ({
  service_id: s.id,
  business_id: s.business_id,
  name: s.name,
  description: s.description,
  category: s.category,
  price_type: s.price_type,
  price_minor: s.price_minor,
  currency: s.currency,
});
const myBusiness = () => S().businesses.find((b) => b.owner_id === DEMO_ME && !b.deleted_at) ?? null;
const bizById = (id: string) => S().businesses.find((b) => b.id === id);
/** The request, if you're its customer or the shop, with your role. */
function party(id: string) {
  const r = S().serviceRequests.find((x) => x.id === id);
  const b = r && bizById(r.business_id);
  if (!r || !b) return null;
  const role = b.owner_id === DEMO_ME ? "business" : r.customer_id === DEMO_ME ? "customer" : null;
  return role ? { r, b, role: role as "business" | "customer" } : null;
}
const nameTaken = (name: string, except: string | null) =>
  S().businesses.some((b) => !b.deleted_at && b.id !== except && b.name.toLowerCase() === name.toLowerCase());

export const demoServicesService: ServicesServiceApi = {
  browse: ({ query = "", category = null, page = 0 }) =>
    K.run(() =>
      K.page(
        S()
          .businesses.map(publicBusiness)
          .filter((b): b is PublicBusiness => b !== null && matchesBusiness(b, searchWords(query), category))
          .sort(sortBusinesses),
        page,
      ),
    ),
  business: (id) =>
    K.run(() => {
      const b = bizById(id);
      return b ? publicBusiness(b) : null;
    }),
  services: (businessId) =>
    K.run(() => {
      const b = bizById(businessId);
      return b && publicBusiness(b)
        ? liveServices(businessId)
            .sort((x, y) => x.name.localeCompare(y.name))
            .map(toPublicService)
        : [];
    }),
  myBusiness: () => K.run(() => myBusiness()),
  myServices: () =>
    K.run(() =>
      S()
        .businessServices.filter((s) => s.owner_id === DEMO_ME && !s.deleted_at)
        .sort((a, b) => a.name.localeCompare(b.name)),
    ),
  createBusiness: (input) =>
    K.run(() => {
      if (myBusiness()) K.refuse("businessExists");
      if (nameTaken(input.name, null)) K.refuse("businessNameTaken");
      const row: BusinessRow = {
        id: K.newId(),
        owner_id: DEMO_ME,
        ...input,
        created_at: now(),
        updated_at: now(),
        deleted_at: null,
      };
      S().businesses.push(row);
      return row.id;
    }),
  updateBusiness: (id, input) =>
    K.run(() => {
      const b = myBusiness();
      if (!b || b.id !== id) return K.refuse("buildNotFound");
      if (nameTaken(input.name, id)) K.refuse("businessNameTaken");
      Object.assign(b, input, { updated_at: now() });
    }),
  deleteBusiness: (id) =>
    K.run(() => {
      const b = myBusiness();
      if (!b || b.id !== id) return;
      b.deleted_at = now();
      liveServices(id).forEach((s) => (s.deleted_at = now()));
      S()
        .serviceRequests.filter((r) => r.business_id === id && live(r))
        .forEach((r) => (r.status = "cancelled"));
    }),
  addService: (businessId, input) =>
    K.run(() => {
      const b = myBusiness();
      if (!b || b.id !== businessId) return K.refuse("buildNotFound");
      if (liveServices(businessId).length >= MAX_SERVICES) K.refuse("serviceLimit");
      S().businessServices.push({
        id: K.newId(),
        business_id: businessId,
        owner_id: DEMO_ME,
        ...input,
        currency: "USD",
        created_at: now(),
        deleted_at: null,
      });
    }),
  updateService: (id, input) =>
    K.run(() => {
      const s = S().businessServices.find((x) => x.id === id && x.owner_id === DEMO_ME && !x.deleted_at);
      if (!s) return K.refuse("buildNotFound");
      Object.assign(s, input);
    }),
  deleteService: (id) =>
    K.run(() => {
      const s = S().businessServices.find((x) => x.id === id && x.owner_id === DEMO_ME && !x.deleted_at);
      if (s) s.deleted_at = now();
    }),
  request: ({ serviceId, vehicle, date, message }) =>
    K.run(() => {
      const s = S().businessServices.find((x) => x.id === serviceId && !x.deleted_at);
      const b = s && bizById(s.business_id);
      if (!s || !b || !publicBusiness(b)) return K.refuse("buildNotFound");
      if (b.owner_id === DEMO_ME) K.refuse("ownBusiness");
      if (!requestDateOk(date)) K.refuse("saveFailed");
      if (S().serviceRequests.some((r) => r.customer_id === DEMO_ME && r.service_id === serviceId && live(r)))
        K.refuse("requestExists");
      const text = message.trim();
      if (!text || text.length > 1000) K.refuse("saveFailed");
      const r: DemoServiceRequest = {
        id: K.newId(),
        business_id: b.id,
        service_id: serviceId,
        customer_id: DEMO_ME,
        vehicle_text: vehicle?.trim() || null,
        preferred_date: date,
        message: text,
        status: "open",
        created_at: now(),
      };
      S().serviceRequests.push(r);
      return r.id;
    }),
  myRequests: () =>
    K.run(() =>
      S()
        .serviceRequests.filter((r) => r.customer_id === DEMO_ME)
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
        .map((r) => ({
          request_id: r.id,
          business_id: r.business_id,
          business_name: bizById(r.business_id)!.name,
          service_name: S().businessServices.find((s) => s.id === r.service_id)?.name ?? null,
          preferred_date: r.preferred_date,
          status: r.status,
          created_at: r.created_at,
        })),
    ),
  businessRequests: () =>
    K.run(() => {
      const b = myBusiness();
      if (!b) return [];
      return S()
        .serviceRequests.filter((r) => r.business_id === b.id && !K.blockedWith(r.customer_id))
        .sort((x, y) => Number(live(y)) - Number(live(x)) || y.created_at.localeCompare(x.created_at))
        .map((r) => ({
          request_id: r.id,
          service_name: S().businessServices.find((s) => s.id === r.service_id)?.name ?? null,
          customer_username: K.userById(r.customer_id)!.username!,
          vehicle_text: r.vehicle_text,
          preferred_date: r.preferred_date,
          status: r.status,
          created_at: r.created_at,
        }));
    }),
  requestDetail: (id) =>
    K.run(() => {
      const p = party(id);
      if (!p) return null;
      return {
        request_id: p.r.id,
        role: p.role,
        business_id: p.b.id,
        business_name: p.b.name,
        service_name: S().businessServices.find((s) => s.id === p.r.service_id)?.name ?? null,
        customer_username: K.userById(p.r.customer_id)!.username!,
        vehicle_text: p.r.vehicle_text,
        preferred_date: p.r.preferred_date,
        message: p.r.message,
        status: p.r.status,
        created_at: p.r.created_at,
      };
    }),
  setStatus: (id, status) =>
    K.run(() => {
      const p = party(id) ?? K.refuse("buildNotFound");
      const from = p.r.status;
      const ok =
        p.role === "business"
          ? (from === "open" && (status === "accepted" || status === "declined")) ||
            (from === "accepted" && status === "completed")
          : (from === "open" || from === "accepted") && status === "cancelled";
      if (!ok) K.refuse("requestClosed");
      p.r.status = status;
    }),
  thread: (id) =>
    K.run(() =>
      party(id)
        ? S()
            .requestMessages.filter((m) => m.request_id === id)
            .sort((a, b) => a.created_at.localeCompare(b.created_at))
            .map((m) => ({
              message_id: m.id,
              mine: m.sender_id === DEMO_ME,
              sender_username: K.userById(m.sender_id)!.username!,
              body: m.body,
              created_at: m.created_at,
            }))
        : [],
    ),
  send: (id, body) =>
    K.run(() => {
      const p = party(id) ?? K.refuse("buildNotFound");
      if (!live(p.r) || p.b.deleted_at) K.refuse("requestClosed");
      const other = p.role === "customer" ? p.b.owner_id : p.r.customer_id;
      if (K.blockedWith(other)) K.refuse("buildNotFound");
      const text = body.trim();
      if (!text || text.length > 1000) K.refuse("saveFailed");
      S().requestMessages.push({ id: K.newId(), request_id: id, sender_id: DEMO_ME, body: text, created_at: now() });
    }),
};
