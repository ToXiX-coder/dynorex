import { beforeEach, describe, expect, it } from "vitest";
import { AppError, hashToken } from "@/lib/security";
import {
  approveRecord,
  createRecord,
  createRecordRequest,
  createShareLink,
  deleteAccount,
  deleteRecord,
  deleteVehicle,
  exportOwnerData,
  getOpenRequest,
  getPublicShare,
  getRecord,
  getVehicle,
  listRecords,
  listRequests,
  listVehicles,
  logIn,
  makeVehiclePrivate,
  readAttachment,
  recordsToCsv,
  rejectRecord,
  revokeRequest,
  revokeShareLink,
  submitPilotInterest,
  submitViaRequest,
  updateRecord,
  updateVehicle,
} from "@/lib/services";
import { PILOT_CONSENT_TEXT } from "@/lib/schemas";
import { MAX_UPLOAD_BYTES } from "@/lib/upload";
import { file, freshStore, makeUser, makeVehicle, modInput, VIN } from "./helpers";

let store: ReturnType<typeof freshStore>;
let alice: string;
let bob: string;

beforeEach(async () => {
  store = freshStore();
  alice = await makeUser(store, "alice@example.test");
  bob = await makeUser(store, "bob@example.test");
});

const code = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    return e instanceof AppError ? e.code : "other";
  }
  return "none";
};

const shopForm = {
  type: "modification",
  title: "Coilovers fitted",
  category: "Suspension",
  status: "installed",
  date: "2026-04-01",
  submitterLabel: "Sample Shop A",
};

describe("1. owner CRUD", () => {
  it("creates a vehicle, then adds, edits and deletes a record", () => {
    const vid = makeVehicle(store, alice);
    expect(listVehicles(store, alice)).toHaveLength(1);
    updateVehicle(store, alice, vid, {
      year: "1999",
      make: "Sample Motors",
      model: "Roadster Demo",
      nickname: "Daily",
    });
    expect(getVehicle(store, alice, vid).nickname).toBe("Daily");
    expect(getVehicle(store, alice, vid).vin).toBeUndefined();

    const rid = createRecord(store, alice, vid, modInput);
    expect(listRecords(store, alice, vid)).toHaveLength(1);
    updateRecord(store, alice, rid, { ...modInput, title: "Rear sway bar" });
    expect(getRecord(store, alice, rid).title).toBe("Rear sway bar");
    expect(getRecord(store, alice, rid).costCents).toBe(18950);
    deleteRecord(store, alice, rid);
    expect(listRecords(store, alice, vid)).toHaveLength(0);
  });

  it("filters by type and status and sorts by date", () => {
    const vid = makeVehicle(store, alice);
    createRecord(store, alice, vid, modInput);
    createRecord(store, alice, vid, {
      ...modInput,
      title: "Planned wheels",
      status: "planned",
      date: "2026-05-01",
    });
    createRecord(store, alice, vid, {
      type: "service",
      title: "Oil change",
      category: "Engine",
      date: "2026-01-02",
    });
    expect(listRecords(store, alice, vid, { type: "service" })).toHaveLength(1);
    expect(listRecords(store, alice, vid, { status: "planned" })[0].title).toBe("Planned wheels");
    expect(listRecords(store, alice, vid, { sort: "newest" })[0].title).toBe("Planned wheels");
    expect(listRecords(store, alice, vid, { sort: "oldest" })[0].title).toBe("Oil change");
  });

  it("validates input on the server", () => {
    const vid = makeVehicle(store, alice);
    expect(code(() => createRecord(store, alice, vid, { ...modInput, date: "2026-02-31" }))).toBe(
      "invalid",
    );
    expect(code(() => createRecord(store, alice, vid, { ...modInput, status: "" }))).toBe(
      "invalid",
    );
    expect(
      code(() => createRecord(store, alice, vid, { ...modInput, source: "shared_link" })),
    ).toBe("invalid");
    expect(
      code(() => updateVehicle(store, alice, vid, { year: "1700", make: "x", model: "y" })),
    ).toBe("invalid");
  });
});

describe("2. attachments and source labels", () => {
  it("shows the measurement label on a record with an attached file", () => {
    const vid = makeVehicle(store, alice);
    const rid = createRecord(
      store,
      alice,
      vid,
      {
        ...modInput,
        type: "setup",
        status: "",
        title: "Dyno sheet",
        source: "measurement_attached",
      },
      [file("dyno.pdf", "pdf")],
    );
    const rec = listRecords(store, alice, vid)[0];
    expect(rec.id).toBe(rid);
    expect(rec.attachments.map((a) => a.displayName)).toEqual(["dyno.pdf"]);
    expect(rec.sourceLabel).toContain("Measurement attached");
    expect(rec.sourceLabel).toContain("has not reproduced or validated");
  });

  it("refuses a measurement label with no file, and labels plain records owner-entered", () => {
    const vid = makeVehicle(store, alice);
    expect(
      code(() => createRecord(store, alice, vid, { ...modInput, source: "measurement_attached" })),
    ).toBe("invalid");
    createRecord(store, alice, vid, modInput, [file("receipt.png", "png")]);
    expect(listRecords(store, alice, vid)[0].sourceLabel).toMatch(/^Owner-entered/);
  });
});

describe("3. privacy of share pages", () => {
  it("shows only chosen entries and fields, never VIN or ids", () => {
    const vid = makeVehicle(store, alice);
    const shown = createRecord(store, alice, vid, modInput);
    createRecord(store, alice, vid, { ...modInput, title: "Hidden entry" });
    const { token } = createShareLink(store, alice, vid, {
      recordIds: [shown],
      fields: [],
      days: 7,
    });
    const view = getPublicShare(store, token)!;
    const json = JSON.stringify(view);
    expect(view.records.map((r) => r.title)).toEqual(["Front sway bar"]);
    expect(json).not.toContain(VIN);
    expect(json).not.toContain("alice@example.test");
    expect(json).not.toContain(alice);
    expect(json).not.toContain(vid);
    expect(json).not.toContain("Hidden entry");
    expect(json).not.toContain("Private garage note");
    expect(json).not.toContain("189.50");
    expect(json).not.toContain("SB-1234");
    expect(view.currentMileage).toBeUndefined();
  });

  it("includes optional fields only when the owner ticks them", () => {
    const vid = makeVehicle(store, alice);
    const rid = createRecord(store, alice, vid, modInput);
    const { token } = createShareLink(store, alice, vid, {
      recordIds: [rid],
      fields: ["cost", "notes", "partNumbers"],
      days: 7,
    });
    const rec = getPublicShare(store, token)!.records[0];
    expect(rec.cost).toBe("189.50 USD");
    expect(rec.notes).toBe("Private garage note");
    expect(rec.partNumber).toBe("SB-1234");
  });

  it("making a vehicle private closes its links", () => {
    const vid = makeVehicle(store, alice);
    const rid = createRecord(store, alice, vid, modInput);
    const { token } = createShareLink(store, alice, vid, { recordIds: [rid], fields: [], days: 7 });
    expect(getPublicShare(store, token)).not.toBeNull();
    makeVehiclePrivate(store, alice, vid);
    expect(getPublicShare(store, token)).toBeNull();
  });

  it("stops working when the vehicle or entry is deleted", () => {
    const vid = makeVehicle(store, alice);
    const rid = createRecord(store, alice, vid, modInput);
    const { token } = createShareLink(store, alice, vid, { recordIds: [rid], fields: [], days: 7 });
    deleteRecord(store, alice, rid);
    expect(getPublicShare(store, token)!.records).toHaveLength(0);
    deleteVehicle(store, alice, vid);
    expect(getPublicShare(store, token)).toBeNull();
  });

  it("stores only a hash of the token", () => {
    const vid = makeVehicle(store, alice);
    const rid = createRecord(store, alice, vid, modInput);
    const { token } = createShareLink(store, alice, vid, { recordIds: [rid], fields: [], days: 7 });
    expect(token.length).toBeGreaterThanOrEqual(43);
    expect(JSON.stringify(store.read((d) => d))).not.toContain(token);
  });
});

describe("4. revoked and expired links", () => {
  it("share links fail after revoke or expiry, and a guessed token fails", () => {
    const vid = makeVehicle(store, alice);
    const rid = createRecord(store, alice, vid, modInput);
    const a = createShareLink(store, alice, vid, { recordIds: [rid], fields: [], days: 7 });
    const b = createShareLink(store, alice, vid, { recordIds: [rid], fields: [], days: 7 });
    expect(getPublicShare(store, a.token)).not.toBeNull();
    const linkA = store.read((d) => d.shareLinks[0].id);
    revokeShareLink(store, alice, linkA);
    expect(getPublicShare(store, a.token)).toBeNull();
    store.write((d) => {
      d.shareLinks[1].expiresAt = new Date(Date.now() - 1000).toISOString();
    });
    expect(getPublicShare(store, b.token)).toBeNull();
    expect(getPublicShare(store, "not-a-real-token")).toBeNull();
  });

  it("request links fail after revoke or expiry", () => {
    const vid = makeVehicle(store, alice);
    const a = createRecordRequest(store, alice, vid, 7);
    const b = createRecordRequest(store, alice, vid, 7);
    revokeRequest(
      store,
      alice,
      listRequests(store, alice, vid).find((r) => r.state === "open")!.id,
    );
    const states = listRequests(store, alice, vid).map((r) => r.state);
    expect(states).toContain("revoked");
    store.write((d) => {
      d.requests.forEach((r) => {
        if (!r.revokedAt) r.expiresAt = new Date(Date.now() - 1000).toISOString();
      });
    });
    expect(getOpenRequest(store, a.token)).toBeNull();
    expect(getOpenRequest(store, b.token)).toBeNull();
    expect(code(() => submitViaRequest(store, a.token, shopForm))).toBe("not_found");
    expect(code(() => submitViaRequest(store, b.token, shopForm))).toBe("not_found");
  });
});

describe("5. no access to another user's data", () => {
  it("blocks reads, edits, deletes, shares and exports across owners", () => {
    const vid = makeVehicle(store, alice);
    const rid = createRecord(store, alice, vid, { ...modInput, source: "measurement_attached" }, [
      file("dyno.pdf", "pdf"),
    ]);
    const attId = getRecord(store, alice, rid).attachments[0].id;

    expect(code(() => getVehicle(store, bob, vid))).toBe("not_found");
    expect(code(() => getRecord(store, bob, rid))).toBe("not_found");
    expect(code(() => listRecords(store, bob, vid))).toBe("not_found");
    expect(code(() => readAttachment(store, bob, attId))).toBe("not_found");
    expect(code(() => updateRecord(store, bob, rid, modInput))).toBe("not_found");
    expect(code(() => deleteRecord(store, bob, rid))).toBe("not_found");
    expect(code(() => deleteVehicle(store, bob, vid))).toBe("not_found");
    expect(
      code(() => updateVehicle(store, bob, vid, { year: "2000", make: "A", model: "B" })),
    ).toBe("not_found");
    expect(code(() => createRecord(store, bob, vid, modInput))).toBe("not_found");
    expect(code(() => createRecordRequest(store, bob, vid, 7))).toBe("not_found");
    expect(
      code(() => createShareLink(store, bob, vid, { recordIds: [rid], fields: [], days: 7 })),
    ).toBe("not_found");
    expect(code(() => exportOwnerData(store, bob, vid))).toBe("not_found");
    expect(code(() => revokeShareLink(store, bob, "00000000-0000-4000-8000-000000000000"))).toBe(
      "not_found",
    );

    // Bob cannot put Alice's record in a link on his own vehicle either.
    const bobVid = makeVehicle(store, bob);
    expect(
      code(() => createShareLink(store, bob, bobVid, { recordIds: [rid], fields: [], days: 7 })),
    ).toBe("not_found");

    // Alice still has everything.
    expect(readAttachment(store, alice, attId).meta.displayName).toBe("dyno.pdf");
    expect(listVehicles(store, bob)).toHaveLength(1);
  });
});

describe("6. shop link submissions", () => {
  it("need owner approval, are labelled unverified, and work once", () => {
    const vid = makeVehicle(store, alice);
    const { token } = createRecordRequest(store, alice, vid, 7);
    expect(getOpenRequest(store, token)).toEqual(
      expect.objectContaining({ make: "Sample Motors" }),
    );
    expect(JSON.stringify(getOpenRequest(store, token))).not.toContain(VIN);

    submitViaRequest(store, token, shopForm);
    expect(listRecords(store, alice, vid)).toHaveLength(0); // not on the timeline yet
    const pending = listRecords(store, alice, vid, { approval: "pending" });
    expect(pending).toHaveLength(1);
    expect(pending[0].source).toBe("shared_link");
    expect(pending[0].identityCheckedAt).toBeNull();
    expect(pending[0].sourceLabel).toContain("Sender identity not independently verified");

    // one-time use
    expect(code(() => submitViaRequest(store, token, shopForm))).toBe("not_found");
    expect(getOpenRequest(store, token)).toBeNull();

    // not shareable until approved
    expect(
      code(() =>
        createShareLink(store, alice, vid, { recordIds: [pending[0].id], fields: [], days: 7 }),
      ),
    ).toBe("not_found");
    approveRecord(store, alice, pending[0].id);
    const live = listRecords(store, alice, vid);
    expect(live).toHaveLength(1);
    expect(live[0].sourceLabel).toContain("not independently verified");
    expect(code(() => updateRecord(store, alice, live[0].id, modInput))).toBe("conflict");
    const link = createShareLink(store, alice, vid, {
      recordIds: [live[0].id],
      fields: [],
      days: 7,
    });
    expect(getPublicShare(store, link.token)!.records[0].sourceLabel).toContain(
      "not independently verified",
    );
  });

  it("pending submissions never show on public pages, and rejecting deletes them", () => {
    const vid = makeVehicle(store, alice);
    const rid = createRecord(store, alice, vid, modInput);
    const { token } = createRecordRequest(store, alice, vid, 7);
    submitViaRequest(store, token, shopForm);
    const pendingId = listRecords(store, alice, vid, { approval: "pending" })[0].id;
    // even a forged link that names the pending id shows nothing for it
    store.write((d) => {
      d.shareLinks.push({
        id: "l",
        vehicleId: vid,
        ownerId: alice,
        tokenHash: hashToken("forged"),
        fields: [],
        recordIds: [rid, pendingId],
        expiresAt: "2999-01-01T00:00:00Z",
        revokedAt: null,
        createdAt: "",
      });
    });
    expect(getPublicShare(store, "forged")!.records.map((r) => r.title)).toEqual([
      "Front sway bar",
    ]);
    rejectRecord(store, alice, pendingId);
    expect(listRecords(store, alice, vid, { approval: "pending" })).toHaveLength(0);
  });

  it("ignores any vehicle or owner the sender tries to supply, and rejects bad input without using the link", () => {
    const aliceVid = makeVehicle(store, alice);
    const bobVid = makeVehicle(store, bob);
    const { token } = createRecordRequest(store, alice, aliceVid, 7);
    expect(code(() => submitViaRequest(store, token, { ...shopForm, date: "nope" }))).toBe(
      "invalid",
    );
    expect(getOpenRequest(store, token)).not.toBeNull();
    submitViaRequest(store, token, {
      ...shopForm,
      vehicleId: bobVid,
      ownerId: bob,
      source: "owner_entered",
      approval: "approved",
    });
    expect(listRecords(store, bob, bobVid, { approval: "pending" })).toHaveLength(0);
    const rec = listRecords(store, alice, aliceVid, { approval: "pending" })[0];
    expect(rec.source).toBe("shared_link");
    expect(rec.approval).toBe("pending");
  });
});

describe("7. export", () => {
  it("contains only the signed-in owner's data and no secrets", () => {
    const vid = makeVehicle(store, alice);
    const bobVid = makeVehicle(store, bob);
    createRecord(store, alice, vid, { ...modInput, title: "Alice =cmd()" });
    createRecord(store, bob, bobVid, { ...modInput, title: "Bob only entry" });
    const rid = listRecords(store, alice, vid)[0].id;
    createShareLink(store, alice, vid, { recordIds: [rid], fields: [], days: 7 });

    const data = exportOwnerData(store, alice);
    const json = JSON.stringify(data);
    expect(data.vehicles).toHaveLength(1);
    expect(json).toContain("Alice =cmd()");
    expect(json).not.toContain("Bob only entry");
    expect(json).not.toContain("tokenHash");
    expect(json).not.toContain("storageKey");
    expect(json).not.toContain("passwordHash");

    const csv = recordsToCsv(data);
    expect(csv).not.toContain("Bob only entry");
    expect(csv).toContain('"Alice =cmd()"');
    const injected = recordsToCsv({
      ...data,
      records: [{ ...data.records[0], title: "=HYPERLINK(1)" }],
    });
    expect(injected).toContain(`"'=HYPERLINK(1)"`);
  });
});

describe("8. upload validation", () => {
  it("rejects disallowed types, mismatched content and oversize files", () => {
    const vid = makeVehicle(store, alice);
    expect(code(() => createRecord(store, alice, vid, modInput, [file("virus.exe", "exe")]))).toBe(
      "invalid",
    );
    const fake = file("photo.png", "exe"); // an .exe pretending to be a png
    fake.type = "image/png";
    expect(code(() => createRecord(store, alice, vid, modInput, [fake]))).toBe("invalid");
    expect(
      code(() =>
        createRecord(store, alice, vid, modInput, [file("big.png", "png", MAX_UPLOAD_BYTES + 1)]),
      ),
    ).toBe("invalid");
    expect(
      code(() => createRecord(store, alice, vid, modInput, [file("empty.png", "png", 0)])),
    ).toBe("invalid");
    const six = Array.from({ length: 6 }, (_, i) => file(`f${i}.png`, "png"));
    expect(code(() => createRecord(store, alice, vid, modInput, six))).toBe("invalid");
    expect(listRecords(store, alice, vid)).toHaveLength(0);
    expect(store.read((d) => d.attachments)).toHaveLength(0);
    createRecord(store, alice, vid, modInput, [file("../../etc/passwd.png", "png")]);
    expect(listRecords(store, alice, vid)[0].attachments[0].displayName).toBe("passwd.png");
  });

  it("only allows an image as the vehicle photo", () => {
    expect(() =>
      updateVehicle(
        store,
        alice,
        makeVehicle(store, alice),
        { year: "2000", make: "A", model: "B" },
        { photo: file("a.pdf", "pdf") },
      ),
    ).toThrow();
  });
});

describe("9. shop pilot interest form", () => {
  const good = {
    shopName: "Sample Shop A",
    contactName: "Sam Sample",
    email: "sam@example.test",
    region: "Sample Region",
    workType: "Suspension and tuning",
    consent: "on",
  };

  it("stores the submission with consent text and time", () => {
    submitPilotInterest(store, good);
    const [row] = store.read((d) => d.interests);
    expect(row.shopName).toBe("Sample Shop A");
    expect(row.consentText).toBe(PILOT_CONSENT_TEXT);
    expect(new Date(row.consentAt).getTime()).toBeGreaterThan(0);
  });

  it("rejects missing consent and bad email, and ignores bot submissions", () => {
    expect(code(() => submitPilotInterest(store, { ...good, consent: undefined }))).toBe("invalid");
    expect(code(() => submitPilotInterest(store, { ...good, email: "nope" }))).toBe("invalid");
    expect(code(() => submitPilotInterest(store, { ...good, shopName: " " }))).toBe("invalid");
    submitPilotInterest(store, good, "http://spam.example");
    expect(store.read((d) => d.interests)).toHaveLength(0);
  });
});

describe("accounts", () => {
  it("logs in, rejects a wrong password, and deletes all of an owner's data", async () => {
    const vid = makeVehicle(store, alice);
    createRecord(store, alice, vid, modInput, [file("r.png", "png")]);
    const bobVid = makeVehicle(store, bob);
    await expect(
      logIn(store, { email: "alice@example.test", password: "wrong-password-123" }),
    ).rejects.toThrow();
    const { userId } = await logIn(store, {
      email: "alice@example.test",
      password: "correct-horse-battery",
    });
    expect(userId).toBe(alice);
    const key = store.read((d) => d.attachments[0].storageKey);
    deleteAccount(store, alice);
    const db = store.read((d) => d);
    expect(db.users.map((u) => u.id)).toEqual([bob]);
    expect(db.vehicles.map((v) => v.id)).toEqual([bobVid]);
    expect(db.records).toHaveLength(0);
    expect(db.sessions).toHaveLength(0);
    expect(store.getFile(key)).toBeNull();
  });
});
