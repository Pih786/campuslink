import { api } from "../services/api";

// GET /students is paginated (at most 100 a page); directory-style pages
// need every student in scope, so fetch all pages.
export async function fetchAllStudents() {
  const first = await api.get("/students?limit=100&page=1");
  const students = [...(first.data ?? [])];
  const pages = first.pagination?.totalPages ?? 1;
  for (let page = 2; page <= pages; page++) {
    const res = await api.get(`/students?limit=100&page=${page}`);
    students.push(...(res.data ?? []));
  }
  return students;
}
