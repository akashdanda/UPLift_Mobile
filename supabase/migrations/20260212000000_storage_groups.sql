-- Storage bucket for group avatar images
INSERT INTO storage.buckets (id, name, public)
VALUES ('groups', 'groups', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Allow group creator or group members to upload to a group folder (path: group_id/filename)
CREATE POLICY "Group creator or members can upload group image"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'groups'
    AND (
      (storage.foldername(name))[1]::uuid IN (
        SELECT id FROM public.groups WHERE created_by = auth.uid()
      )
      OR (storage.foldername(name))[1]::uuid IN (
        SELECT group_id FROM public.group_members WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "Group creator or members can update group image"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'groups'
    AND (
      (storage.foldername(name))[1]::uuid IN (
        SELECT id FROM public.groups WHERE created_by = auth.uid()
      )
      OR (storage.foldername(name))[1]::uuid IN (
        SELECT group_id FROM public.group_members WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "Group creator or members can delete group image"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'groups'
    AND (
      (storage.foldername(name))[1]::uuid IN (
        SELECT id FROM public.groups WHERE created_by = auth.uid()
      )
      OR (storage.foldername(name))[1]::uuid IN (
        SELECT group_id FROM public.group_members WHERE user_id = auth.uid()
      )
    )
  );

-- Public read so avatar URLs work
CREATE POLICY "Group images are publicly readable"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'groups');
