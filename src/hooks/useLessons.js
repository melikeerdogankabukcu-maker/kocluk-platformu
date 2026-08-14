import { useState, useEffect } from "react";
import { supabase } from "../supabase";

// Bir kullanıcının (öğretmen / öğrenci / veli) derslerini yönetir.
// RLS sayesinde select yalnızca kullanıcının taraf olduğu (veya velinin çocuğunun)
// derslerini döndürür. Öğretmen/öğrenci adları FK join ile birlikte gelir.
export function useLessons(userId) {
  const [lessons, setLessons] = useState([]);
  const [loading, setLoading] = useState(true);

  const reload = async () => {
    const { data } = await supabase
      .from("lessons")
      .select(`*,
        teacher:users!lessons_teacher_id_fkey(full_name),
        student:users!lessons_student_id_fkey(full_name)`)
      .order("lesson_date", { ascending: true })
      .order("start_time",  { ascending: true });
    setLessons(data ?? []);
    setLoading(false);
  };

  useEffect(() => { if (userId) reload(); }, [userId]);

  // Yeni ders teklifi oluştur. Oluşturan tarafın onayı otomatik verilmiş sayılır.
  const createLesson = async (payload) => {
    const amTeacher = userId === payload.teacher_id;
    const { error } = await supabase.from("lessons").insert({
      ...payload,
      created_by:       userId,
      teacher_approved: amTeacher,
      student_approved: !amTeacher,
      status:           "beklemede",
    });
    if (!error) await reload();
    return { error };
  };

  // Karşı tarafın teklifi onaylaması / reddetmesi
  const respondLesson = async (lesson, approve) => {
    if (!approve) {
      await supabase.from("lessons").update({ status: "reddedildi" }).eq("id", lesson.id);
      await reload();
      return;
    }
    const amTeacher = userId === lesson.teacher_id;
    const patch = amTeacher ? { teacher_approved: true } : { student_approved: true };
    // Bu onaydan sonra iki taraf da onaylamış olur → onaylandı
    patch.status = "onaylandi";
    await supabase.from("lessons").update(patch).eq("id", lesson.id);
    await reload();
  };

  const cancelLesson = async (id) => {
    await supabase.from("lessons").update({ status: "iptal" }).eq("id", id);
    await reload();
  };

  // Öğretmen: dersi 'yapıldı' işaretler
  const markCompleted = async (id) => {
    await supabase.from("lessons").update({ completed: true }).eq("id", id);
    await reload();
  };

  // Veli: "ödedim" bildirir
  const reportPaid = async (id) => {
    await supabase.from("lessons").update({ payment_status: "bildirildi" }).eq("id", id);
    await reload();
  };

  // Öğretmen: ödeme bildirimini onaylar (veya geri çevirir)
  const confirmPaid = async (id, ok = true) => {
    await supabase.from("lessons").update({ payment_status: ok ? "odendi" : "odenmedi" }).eq("id", id);
    await reload();
  };

  return { lessons, loading, reload, createLesson, respondLesson, cancelLesson, markCompleted, reportPaid, confirmPaid };
}
