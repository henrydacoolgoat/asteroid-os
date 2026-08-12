update storage.buckets
set allowed_mime_types=null,
    file_size_limit=104857600,
    public=false
where id='messagex-media-queue';
