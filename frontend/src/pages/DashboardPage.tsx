import React, { useEffect, useState, useCallback } from "react";
import axios from "axios";

const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:3001/api";

interface FacultyRow {
  itsNumber: string;
  firstName: string;
  lastName: string;
  email?: string | null;
  phone?: string | null;
}

interface ExportPreview {
  headers: string[];
  sampleRows: Record<string, unknown>[];
  totalRows: number;
}

interface CustomField {
  id: string;
  name: string;
  label: string;
  fieldType: "TEXT" | "NUMBER" | "DATE" | "SELECT" | "BOOLEAN" | "TEXTAREA";
  options?: string | null;
  isRequired?: boolean;
}

interface Category {
  id: string;
  name: string;
}

function DashboardPage() {
  const [search, setSearch] = useState("");
  const [faculty, setFaculty] = useState<FacultyRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exportPreview, setExportPreview] = useState<ExportPreview | null>(null);
  const [selectedIts, setSelectedIts] = useState<string | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [facultyCustomFields, setFacultyCustomFields] = useState<CustomField[]>([]);
  const [familyCustomFields, setFamilyCustomFields] = useState<CustomField[]>([]);
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>([]);
  const [facultyCustomValues, setFacultyCustomValues] = useState<Record<string, string>>({});
  const [familyCustomValues, setFamilyCustomValues] = useState<Record<string, string>>({});
  const [facultyForm, setFacultyForm] = useState({
    itsNumber: "",
    firstName: "",
    lastName: "",
    firstNameAr: "",
    lastNameAr: "",
    email: "",
    phone: "",
    gender: "MALE"
  });
  const [familyForm, setFamilyForm] = useState({
    relationship: "Spouse",
    firstName: "",
    lastName: "",
    firstNameAr: "",
    lastNameAr: "",
    gender: "MALE"
  });
  const [formMessage, setFormMessage] = useState<string | null>(null);
  const [includeFamilyInExport, setIncludeFamilyInExport] = useState(true);
  const [selectedExportFields, setSelectedExportFields] = useState<string[]>([
    "itsNumber",
    "firstName",
    "lastName",
    "gender"
  ]);

  const token = localStorage.getItem("token");

  const client = axios.create({
    baseURL: API_BASE,
    headers: token ? { Authorization: `Bearer ${token}` } : {}
  });

  const loadFaculty = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await client.get("/faculty", {
        params: search ? { search } : {}
      });
      setFaculty(
        res.data.data.map((f: FacultyRow) => ({
          itsNumber: f.itsNumber,
          firstName: f.firstName,
          lastName: f.lastName,
          email: f.email,
          phone: f.phone
        }))
      );
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } };
      setError(err.response?.data?.error ?? "Unable to load faculty.");
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const loadStructure = useCallback(async () => {
    try {
      const [categoryRes, facultyFieldRes, familyFieldRes] = await Promise.all([
        client.get("/categories"),
        client.get("/custom-fields", { params: { entityType: "FACULTY" } }),
        client.get("/custom-fields", { params: { entityType: "FAMILY" } })
      ]);
      setCategories(categoryRes.data);
      setFacultyCustomFields(facultyFieldRes.data);
      setFamilyCustomFields(familyFieldRes.data);
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } };
      setError(err.response?.data?.error ?? "Unable to load category/custom field settings.");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadFaculty();
    loadStructure();
  }, [loadFaculty, loadStructure]);

  // FIX: Accept optional overrideIts to avoid stale closure on selectedIts state
  const handleExportPreview = async (overrideIts?: string | null) => {
    setExportPreview(null);
    setError(null);
    try {
      // FIX: Use overrideIts when explicitly provided (including null for "all"),
      // fall back to selectedIts only when not overriding.
      const itsParam = overrideIts === undefined ? selectedIts : overrideIts;
      const params: Record<string, string> = {
        format: "multi-sheet",
        preview: "true",
        includeFamily: includeFamilyInExport ? "true" : "false",
        facultyFields: selectedExportFields.join(",")
      };
      if (itsParam) params.its = itsParam;
      const res = await client.get("/excel/export", { params });
      setExportPreview(res.data);
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } };
      setError(err.response?.data?.error ?? "Unable to get export preview.");
    }
  };

  const handleExportDownload = async () => {
    setError(null);
    try {
      const res = await client.get("/excel/export", {
        params: {
          format: "multi-sheet",
          includeFamily: includeFamilyInExport ? "true" : "false",
          facultyFields: selectedExportFields.join(","),
          ...(selectedIts ? { its: selectedIts } : {})
        },
        responseType: "blob"
      });
      const blobUrl = URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = `faculty_export_${Date.now()}.xlsx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(blobUrl);
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } };
      setError(err.response?.data?.error ?? "Unable to download export file.");
    }
  };

  const buildCustomFieldPayload = (fields: CustomField[], values: Record<string, string>) =>
    fields
      .map(field => ({ fieldId: field.id, value: values[field.id] ?? "" }))
      .filter(item => item.value !== "");

  const handleAddFaculty = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setFormMessage(null);
    try {
      await client.post("/faculty", {
        ...facultyForm,
        categoryIds: selectedCategoryIds,
        customFields: buildCustomFieldPayload(facultyCustomFields, facultyCustomValues)
      });
      setFormMessage("Faculty record added successfully.");
      setFacultyForm({
        itsNumber: "",
        firstName: "",
        lastName: "",
        firstNameAr: "",
        lastNameAr: "",
        email: "",
        phone: "",
        gender: "MALE"
      });
      setFacultyCustomValues({});
      loadFaculty();
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } };
      setError(err.response?.data?.error ?? "Unable to add faculty.");
    }
  };

  const handleAddFamily = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedIts) {
      setError("Please select a faculty member first.");
      return;
    }
    setError(null);
    setFormMessage(null);
    try {
      await client.post("/family", {
        facultyId: selectedIts,
        ...familyForm,
        customFields: buildCustomFieldPayload(familyCustomFields, familyCustomValues)
      });
      setFormMessage("Family member added successfully.");
      setFamilyForm({
        relationship: "Spouse",
        firstName: "",
        lastName: "",
        firstNameAr: "",
        lastNameAr: "",
        gender: "MALE"
      });
      setFamilyCustomValues({});
      loadFaculty();
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } };
      setError(err.response?.data?.error ?? "Unable to add family member.");
    }
  };

  const renderDynamicField = (
    field: CustomField,
    values: Record<string, string>,
    setValues: React.Dispatch<React.SetStateAction<Record<string, string>>>
  ) => {
    const value = values[field.id] ?? "";
    const onChangeValue = (next: string) =>
      setValues(prev => ({
        ...prev,
        [field.id]: next
      }));

    if (field.fieldType === "SELECT") {
      let options: string[] = [];
      try {
        options = field.options ? JSON.parse(field.options) : [];
      } catch {
        options = [];
      }
      return (
        <select
          className="w-full border border-slate-300 rounded-lg px-3 py-2 text-base"
          value={value}
          onChange={e => onChangeValue(e.target.value)}
          required={Boolean(field.isRequired)}
        >
          <option value="">Select option</option>
          {options.map(option => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      );
    }

    if (field.fieldType === "TEXTAREA") {
      return (
        <textarea
          className="w-full border border-slate-300 rounded-lg px-3 py-2 text-base"
          value={value}
          onChange={e => onChangeValue(e.target.value)}
          required={Boolean(field.isRequired)}
        />
      );
    }

    if (field.fieldType === "BOOLEAN") {
      return (
        <select
          className="w-full border border-slate-300 rounded-lg px-3 py-2 text-base"
          value={value}
          onChange={e => onChangeValue(e.target.value)}
          required={Boolean(field.isRequired)}
        >
          <option value="">Select</option>
          <option value="true">Yes</option>
          <option value="false">No</option>
        </select>
      );
    }

    const inputType =
      field.fieldType === "NUMBER" ? "number" : field.fieldType === "DATE" ? "date" : "text";
    return (
      <input
        type={inputType}
        className="w-full border border-slate-300 rounded-lg px-3 py-2 text-base"
        value={value}
        onChange={e => onChangeValue(e.target.value)}
        required={Boolean(field.isRequired)}
      />
    );
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-blue-800 text-white py-4 px-6 flex justify-between items-center">
        <h1 className="text-xl font-semibold">Faculty &amp; Family Dashboard</h1>
        <button
          className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg text-base"
          onClick={() => {
            localStorage.removeItem("token");
            window.location.href = "/login";
          }}
        >
          Logout
        </button>
      </header>
      <main className="p-6 text-lg space-y-6">
        <section className="bg-white rounded-xl shadow-sm p-4">
          <h2 className="text-lg font-semibold mb-3">Add Faculty (with Dynamic Fields)</h2>
          <form onSubmit={handleAddFaculty} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block mb-1 font-medium text-base">ITS Number *</label>
              <input className="w-full border border-slate-300 rounded-lg px-3 py-2 text-base" value={facultyForm.itsNumber} onChange={e => setFacultyForm(prev => ({ ...prev, itsNumber: e.target.value }))} required />
            </div>
            <div>
              <label className="block mb-1 font-medium text-base">First Name *</label>
              <input className="w-full border border-slate-300 rounded-lg px-3 py-2 text-base" value={facultyForm.firstName} onChange={e => setFacultyForm(prev => ({ ...prev, firstName: e.target.value }))} required />
            </div>
            <div>
              <label className="block mb-1 font-medium text-base">Last Name *</label>
              <input className="w-full border border-slate-300 rounded-lg px-3 py-2 text-base" value={facultyForm.lastName} onChange={e => setFacultyForm(prev => ({ ...prev, lastName: e.target.value }))} required />
            </div>
            <div>
              <label className="block mb-1 font-medium text-base">Gender *</label>
              <select className="w-full border border-slate-300 rounded-lg px-3 py-2 text-base" value={facultyForm.gender} onChange={e => setFacultyForm(prev => ({ ...prev, gender: e.target.value }))}>
                <option value="MALE">Male</option>
                <option value="FEMALE">Female</option>
              </select>
            </div>
            <div>
              <label className="block mb-1 font-medium text-base">First Name (Arabic)</label>
              <input dir="rtl" className="w-full border border-slate-300 rounded-lg px-3 py-2 text-base" value={facultyForm.firstNameAr} onChange={e => setFacultyForm(prev => ({ ...prev, firstNameAr: e.target.value }))} />
            </div>
            <div>
              <label className="block mb-1 font-medium text-base">Last Name (Arabic)</label>
              <input dir="rtl" className="w-full border border-slate-300 rounded-lg px-3 py-2 text-base" value={facultyForm.lastNameAr} onChange={e => setFacultyForm(prev => ({ ...prev, lastNameAr: e.target.value }))} />
            </div>
            <div>
              <label className="block mb-1 font-medium text-base">Email</label>
              <input type="email" className="w-full border border-slate-300 rounded-lg px-3 py-2 text-base" value={facultyForm.email} onChange={e => setFacultyForm(prev => ({ ...prev, email: e.target.value }))} />
            </div>
            <div>
              <label className="block mb-1 font-medium text-base">Phone</label>
              <input className="w-full border border-slate-300 rounded-lg px-3 py-2 text-base" value={facultyForm.phone} onChange={e => setFacultyForm(prev => ({ ...prev, phone: e.target.value }))} />
            </div>
            <div className="md:col-span-2">
              <label className="block mb-1 font-medium text-base">Categories</label>
              <div className="flex flex-wrap gap-3">
                {categories.map(category => (
                  <label key={category.id} className="inline-flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={selectedCategoryIds.includes(category.id)}
                      onChange={() =>
                        setSelectedCategoryIds(prev =>
                          prev.includes(category.id)
                            ? prev.filter(id => id !== category.id)
                            : [...prev, category.id]
                        )
                      }
                    />
                    <span>{category.name}</span>
                  </label>
                ))}
              </div>
            </div>
            {facultyCustomFields.map(field => (
              <div key={field.id}>
                <label className="block mb-1 font-medium text-base">
                  {field.label}
                  {field.isRequired ? " *" : ""}
                </label>
                {renderDynamicField(field, facultyCustomValues, setFacultyCustomValues)}
              </div>
            ))}
            <div className="md:col-span-2">
              <button className="bg-blue-700 hover:bg-blue-800 text-white font-semibold px-4 py-2 rounded-lg text-base" type="submit">
                Save Faculty
              </button>
            </div>
          </form>
          {formMessage && (
            <div className="mt-3 text-sm text-green-800 bg-green-100 border border-green-300 rounded-md px-3 py-2">
              {formMessage}
            </div>
          )}
        </section>

        <section className="bg-white rounded-xl shadow-sm p-4">
          <h2 className="text-lg font-semibold mb-3">Add Family Member (with Dynamic Fields)</h2>
          <p className="text-slate-700 mb-3">
            Selected faculty ITS: <span className="font-semibold">{selectedIts ?? "None selected"}</span>
          </p>
          <form onSubmit={handleAddFamily} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block mb-1 font-medium text-base">Relationship *</label>
              <select className="w-full border border-slate-300 rounded-lg px-3 py-2 text-base" value={familyForm.relationship} onChange={e => setFamilyForm(prev => ({ ...prev, relationship: e.target.value }))}>
                <option value="Spouse">Spouse</option>
                <option value="Child">Child</option>
                <option value="Other">Other</option>
              </select>
            </div>
            <div>
              <label className="block mb-1 font-medium text-base">Gender *</label>
              <select className="w-full border border-slate-300 rounded-lg px-3 py-2 text-base" value={familyForm.gender} onChange={e => setFamilyForm(prev => ({ ...prev, gender: e.target.value }))}>
                <option value="MALE">Male</option>
                <option value="FEMALE">Female</option>
              </select>
            </div>
            <div>
              <label className="block mb-1 font-medium text-base">First Name *</label>
              <input className="w-full border border-slate-300 rounded-lg px-3 py-2 text-base" value={familyForm.firstName} onChange={e => setFamilyForm(prev => ({ ...prev, firstName: e.target.value }))} required />
            </div>
            <div>
              <label className="block mb-1 font-medium text-base">Last Name *</label>
              <input className="w-full border border-slate-300 rounded-lg px-3 py-2 text-base" value={familyForm.lastName} onChange={e => setFamilyForm(prev => ({ ...prev, lastName: e.target.value }))} required />
            </div>
            <div>
              <label className="block mb-1 font-medium text-base">First Name (Arabic)</label>
              <input dir="rtl" className="w-full border border-slate-300 rounded-lg px-3 py-2 text-base" value={familyForm.firstNameAr} onChange={e => setFamilyForm(prev => ({ ...prev, firstNameAr: e.target.value }))} />
            </div>
            <div>
              <label className="block mb-1 font-medium text-base">Last Name (Arabic)</label>
              <input dir="rtl" className="w-full border border-slate-300 rounded-lg px-3 py-2 text-base" value={familyForm.lastNameAr} onChange={e => setFamilyForm(prev => ({ ...prev, lastNameAr: e.target.value }))} />
            </div>
            {familyCustomFields.map(field => (
              <div key={field.id}>
                <label className="block mb-1 font-medium text-base">
                  {field.label}
                  {field.isRequired ? " *" : ""}
                </label>
                {renderDynamicField(field, familyCustomValues, setFamilyCustomValues)}
              </div>
            ))}
            <div className="md:col-span-2">
              <button className="bg-blue-700 hover:bg-blue-800 text-white font-semibold px-4 py-2 rounded-lg text-base" type="submit">
                Save Family Member
              </button>
            </div>
          </form>
        </section>

        <section className="bg-white rounded-xl shadow-sm p-4">
          <h2 className="text-lg font-semibold mb-3">Find Faculty</h2>
          <div className="flex flex-col gap-3 md:flex-row md:items-end">
            <div className="flex-1">
              <label className="block mb-1 font-medium text-base">
                Search by ITS, name, or family name
              </label>
              <input
                type="text"
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Example: 123456, Fatema, Ali..."
              />
            </div>
            <button
              className="bg-blue-700 hover:bg-blue-800 text-white font-semibold px-4 py-2 rounded-lg text-base"
              onClick={loadFaculty}
              disabled={loading}
            >
              {loading ? "Searching..." : "Search"}
            </button>
          </div>
          {error && (
            <div className="mt-3 text-sm text-red-700 bg-red-100 border border-red-300 rounded-md px-3 py-2">
              {error}
            </div>
          )}
        </section>

        <section className="bg-white rounded-xl shadow-sm p-4">
          <h2 className="text-lg font-semibold mb-3">Faculty List</h2>
          {faculty.length === 0 ? (
            <p className="text-slate-700">No faculty found.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full border border-slate-200 text-base">
                <thead className="bg-slate-100">
                  <tr>
                    <th className="px-3 py-2 border-b text-left">Select</th>
                    <th className="px-3 py-2 border-b text-left">ITS</th>
                    <th className="px-3 py-2 border-b text-left">Name</th>
                    <th className="px-3 py-2 border-b text-left">Email</th>
                    <th className="px-3 py-2 border-b text-left">Phone</th>
                  </tr>
                </thead>
                <tbody>
                  {faculty.map(f => (
                    <tr
                      key={f.itsNumber}
                      className={selectedIts === f.itsNumber ? "bg-blue-50" : ""}
                    >
                      <td className="px-3 py-2 border-b">
                        <input
                          type="radio"
                          name="selectedFaculty"
                          checked={selectedIts === f.itsNumber}
                          onChange={() =>
                            setSelectedIts(
                              selectedIts === f.itsNumber ? null : f.itsNumber
                            )
                          }
                        />
                      </td>
                      <td className="px-3 py-2 border-b">{f.itsNumber}</td>
                      <td className="px-3 py-2 border-b">
                        {f.firstName} {f.lastName}
                      </td>
                      <td className="px-3 py-2 border-b">{f.email ?? "-"}</td>
                      <td className="px-3 py-2 border-b">{f.phone ?? "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="bg-white rounded-xl shadow-sm p-4">
          <h2 className="text-lg font-semibold mb-3">Excel Export</h2>
          <p className="mb-3 text-slate-700">
            You can choose exactly which details you need. Tick the boxes you want, then
            preview and download.
          </p>
          <div className="mb-4">
            <h3 className="font-medium mb-2">Faculty fields</h3>
            <div className="flex flex-wrap gap-4">
              {[
                { key: "itsNumber", label: "ITS" },
                { key: "firstName", label: "First Name" },
                { key: "lastName", label: "Last Name" },
                { key: "gender", label: "Gender" },
                { key: "email", label: "Email" },
                { key: "phone", label: "Phone" },
                { key: "department", label: "Department" },
                { key: "position", label: "Position" }
              ].map(field => (
                <label key={field.key} className="inline-flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={selectedExportFields.includes(field.key)}
                    onChange={() =>
                      setSelectedExportFields(prev =>
                        prev.includes(field.key)
                          ? prev.filter(k => k !== field.key)
                          : [...prev, field.key]
                      )
                    }
                  />
                  <span>{field.label}</span>
                </label>
              ))}
            </div>
          </div>
          <div className="mb-4">
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={includeFamilyInExport}
                onChange={e => setIncludeFamilyInExport(e.target.checked)}
              />
              <span>Include family members (spouse, children, others)</span>
            </label>
          </div>
          <div className="flex flex-wrap gap-3 mb-4">
            {/* FIX: Pass null explicitly so handleExportPreview doesn't use stale selectedIts */}
            <button
              className="bg-slate-200 hover:bg-slate-300 text-slate-900 font-semibold px-4 py-2 rounded-lg text-base"
              onClick={() => {
                setSelectedIts(null);
                handleExportPreview(null);
              }}
            >
              Preview: All Faculty
            </button>
            <button
              className="bg-slate-200 hover:bg-slate-300 text-slate-900 font-semibold px-4 py-2 rounded-lg text-base"
              onClick={() => handleExportPreview()}
              disabled={!selectedIts}
            >
              Preview: Selected Faculty
            </button>
            <button
              className="bg-blue-700 hover:bg-blue-800 text-white font-semibold px-4 py-2 rounded-lg text-base"
              onClick={handleExportDownload}
            >
              Download Excel
            </button>
          </div>
          {exportPreview && (
            <div className="mt-3 border border-slate-200 rounded-lg p-3">
              <p className="font-medium mb-2">
                Preview ({exportPreview.totalRows} rows in total, showing first few):
              </p>
              <div className="overflow-x-auto">
                <table className="min-w-full border border-slate-200 text-base">
                  <thead className="bg-slate-100">
                    <tr>
                      {exportPreview.headers.map(h => (
                        <th key={h} className="px-3 py-2 border-b text-left">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {exportPreview.sampleRows.map((row, idx) => (
                      <tr key={idx}>
                        {exportPreview.headers.map(h => (
                          <td key={h} className="px-3 py-2 border-b">
                            {String(row[h] ?? "")}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

export default DashboardPage;
