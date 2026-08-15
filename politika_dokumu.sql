-- SALT OKUNUR — hiçbir şeyi değiştirmez.
-- Mevcut RLS politikalarını listeler. Çıktıyı kopyalayıp bana verin,
-- ikinci koç için gereken migration'ı buna göre birebir yazayım.

SELECT
  tablename                       AS tablo,
  policyname                      AS politika,
  cmd                             AS islem,
  CASE WHEN permissive = 'PERMISSIVE' THEN 'izin' ELSE 'KISIT' END AS tur,
  coalesce(qual, '-')             AS okuma_kosulu,
  coalesce(with_check, '-')       AS yazma_kosulu
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'tasks', 'student_profiles', 'exam_results', 'homework_submissions',
    'test_sessions', 'exam_topics', 'study_programs', 'users',
    'lessons', 'program_atamalari', 'teacher_students', 'badges',
    'notifications', 'ogrenci_gruplari', 'grup_ogrencileri', 'progress',
    'family_links', 'calendar_events', 'messages'
  )
ORDER BY tablename, cmd, policyname;
