// ============================================================
// YouTube Video Editor - Local Web Application
// ============================================================

(() => {
  'use strict';

  // ---- Constants ----
  const MAX_TRACKS = 8;
  const PIXELS_PER_SECOND_BASE = 100;
  const CANVAS_WIDTH = 1920;
  const CANVAS_HEIGHT = 1080;
  const ACCEPTED_VIDEO = ['.mov', '.mp4', '.webm'];
  const ACCEPTED_IMAGE = ['.png', '.jpg', '.jpeg'];
  const ACCEPTED_AUDIO = ['.m4a', '.mp3', '.wav'];

  // ---- Utility ----
  function generateId() {
    return 'id_' + Math.random().toString(36).substr(2, 9);
  }

  function formatTime(seconds) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${String(m).padStart(2, '0')}:${s.toFixed(3).padStart(6, '0')}`;
  }

  function getFileExtension(name) {
    return '.' + name.split('.').pop().toLowerCase();
  }

  function getMediaType(filename) {
    const ext = getFileExtension(filename);
    if (ACCEPTED_VIDEO.includes(ext)) return 'video';
    if (ACCEPTED_IMAGE.includes(ext)) return 'image';
    if (ACCEPTED_AUDIO.includes(ext)) return 'audio';
    return null;
  }

  function clamp(val, min, max) {
    return Math.max(min, Math.min(max, val));
  }

  // ============================================================
  // MediaItem: represents an imported file
  // ============================================================
  class MediaItem {
    constructor(file) {
      this.id = generateId();
      this.file = file;
      this.name = file.name;
      this.type = getMediaType(file.name);
      this.url = URL.createObjectURL(file);
      this.duration = 0;
      this.thumbnail = null;
      this.element = null; // video/audio/img element
      this.ready = false;
    }

    async load() {
      return new Promise((resolve, reject) => {
        if (this.type === 'video') {
          const video = document.createElement('video');
          video.preload = 'auto';
          video.muted = true;
          video.src = this.url;
          video.onloadedmetadata = () => {
            this.duration = video.duration;
            this.element = video;
            // Generate thumbnail
            video.currentTime = 0.1;
            video.onseeked = () => {
              const canvas = document.createElement('canvas');
              canvas.width = 64;
              canvas.height = 36;
              canvas.getContext('2d').drawImage(video, 0, 0, 64, 36);
              this.thumbnail = canvas.toDataURL();
              this.ready = true;
              resolve(this);
            };
          };
          video.onerror = () => reject(new Error(`Failed to load video: ${this.name}`));
        } else if (this.type === 'image') {
          const img = new Image();
          img.src = this.url;
          img.onload = () => {
            this.duration = 5; // default 5 seconds
            this.element = img;
            this.thumbnail = this.url;
            this.ready = true;
            resolve(this);
          };
          img.onerror = () => reject(new Error(`Failed to load image: ${this.name}`));
        } else if (this.type === 'audio') {
          const audio = document.createElement('audio');
          audio.preload = 'auto';
          audio.src = this.url;
          audio.onloadedmetadata = () => {
            this.duration = audio.duration;
            this.element = audio;
            this.ready = true;
            resolve(this);
          };
          audio.onerror = () => reject(new Error(`Failed to load audio: ${this.name}`));
        } else {
          reject(new Error(`Unsupported file type: ${this.name}`));
        }
      });
    }

    destroy() {
      if (this.url) URL.revokeObjectURL(this.url);
    }
  }

  // ============================================================
  // Clip: an instance placed on a track
  // ============================================================
  class Clip {
    constructor(mediaItem, trackType) {
      this.id = generateId();
      this.mediaId = mediaItem.id;
      this.name = mediaItem.name;
      this.mediaType = mediaItem.type;
      this.trackType = trackType;
      this.startTime = 0;       // position on timeline (seconds)
      this.originalDuration = mediaItem.duration;
      this.trimStart = 0;       // seconds trimmed from beginning
      this.trimEnd = 0;         // seconds trimmed from end
      // Audio properties
      this.volume = 100;
      this.fadeIn = 0;
      this.fadeOut = 0;
      // Image duration
      this.imageDuration = 5;
      // Each clip gets its own media element clone for independent playback
      this.element = null;
      this._initElement(mediaItem);
    }

    _initElement(mediaItem) {
      if (mediaItem.type === 'video') {
        const video = document.createElement('video');
        video.preload = 'auto';
        video.muted = true;
        video.src = mediaItem.url;
        this.element = video;
      } else if (mediaItem.type === 'image') {
        this.element = mediaItem.element; // images can be shared safely
      } else if (mediaItem.type === 'audio') {
        const audio = document.createElement('audio');
        audio.preload = 'auto';
        audio.src = mediaItem.url;
        this.element = audio;
      }
    }

    get duration() {
      if (this.mediaType === 'image') {
        return this.imageDuration - this.trimStart - this.trimEnd;
      }
      return this.originalDuration - this.trimStart - this.trimEnd;
    }

    get endTime() {
      return this.startTime + this.duration;
    }

    get effectiveDuration() {
      if (this.mediaType === 'image') return this.imageDuration;
      return this.originalDuration;
    }
  }

  // ============================================================
  // Track
  // ============================================================
  class Track {
    constructor(type, name) {
      this.id = generateId();
      this.type = type; // 'video' or 'audio'
      this.name = name;
      this.clips = [];
      this.muted = false;
      this.visible = true; // for video tracks
    }
  }

  // ============================================================
  // Editor (main application state)
  // ============================================================
  class Editor {
    constructor() {
      this.mediaLibrary = [];
      this.tracks = [];
      this.currentTime = 0;
      this.isPlaying = false;
      this.selectedClipId = null;
      this.cutMode = false;
      this.zoomLevel = 100;
      this.animFrameId = null;
      this.lastFrameTime = 0;

      // Audio
      this.audioContext = null;

      // Canvas
      this.previewCanvas = document.getElementById('preview-canvas');
      this.previewCtx = this.previewCanvas.getContext('2d');
      this.previewCanvas.width = CANVAS_WIDTH;
      this.previewCanvas.height = CANVAS_HEIGHT;

      // Init default tracks
      this.addTrack('video', '動画 1');
      this.addTrack('audio', '音声 1');

      this.initEventListeners();
      this.renderTimeline();
      this.renderPreview();
    }

    get pixelsPerSecond() {
      return PIXELS_PER_SECOND_BASE * (this.zoomLevel / 100);
    }

    get totalDuration() {
      let max = 0;
      for (const track of this.tracks) {
        for (const clip of track.clips) {
          if (clip.endTime > max) max = clip.endTime;
        }
      }
      return Math.max(max, 10);
    }

    // ---- Media Library ----
    async importFiles(files) {
      for (const file of files) {
        const type = getMediaType(file.name);
        if (!type) {
          alert(`サポートされていないファイル形式です: ${file.name}`);
          continue;
        }
        const item = new MediaItem(file);
        try {
          await item.load();
          this.mediaLibrary.push(item);
        } catch (e) {
          alert(e.message);
        }
      }
      this.renderMediaLibrary();
    }

    removeMedia(mediaId) {
      const idx = this.mediaLibrary.findIndex(m => m.id === mediaId);
      if (idx === -1) return;
      // Remove clips using this media
      for (const track of this.tracks) {
        track.clips = track.clips.filter(c => c.mediaId !== mediaId);
      }
      this.mediaLibrary[idx].destroy();
      this.mediaLibrary.splice(idx, 1);
      this.renderMediaLibrary();
      this.renderTimeline();
      this.renderPreview();
    }

    getMedia(mediaId) {
      return this.mediaLibrary.find(m => m.id === mediaId);
    }

    // ---- Tracks ----
    addTrack(type, name) {
      if (this.tracks.length >= MAX_TRACKS) {
        alert(`トラックは最大${MAX_TRACKS}個までです`);
        return null;
      }
      const track = new Track(type, name || `${type === 'video' ? '動画' : '音声'} ${this.tracks.length + 1}`);
      this.tracks.push(track);
      this.renderTimeline();
      return track;
    }

    removeTrack(trackId) {
      if (this.tracks.length <= 1) return;
      this.tracks = this.tracks.filter(t => t.id !== trackId);
      this.renderTimeline();
      this.renderPreview();
    }

    // ---- Clips ----
    addClipToTrack(trackId, mediaItem, startTime = 0) {
      const track = this.tracks.find(t => t.id === trackId);
      if (!track) return;

      // Validate: video track gets video/image, audio track gets audio
      if (track.type === 'video' && mediaItem.type === 'audio') {
        alert('動画トラックに音声ファイルは配置できません');
        return;
      }
      if (track.type === 'audio' && (mediaItem.type === 'video' || mediaItem.type === 'image')) {
        alert('音声トラックに動画/画像ファイルは配置できません');
        return;
      }

      const clip = new Clip(mediaItem, track.type);
      clip.startTime = startTime;

      // If video has audio, note it (we'll play audio from video element)
      track.clips.push(clip);
      this.selectedClipId = clip.id;
      this.renderTimeline();
      this.renderProperties();
      this.renderPreview();
      return clip;
    }

    removeClip(clipId) {
      for (const track of this.tracks) {
        const idx = track.clips.findIndex(c => c.id === clipId);
        if (idx !== -1) {
          track.clips.splice(idx, 1);
          if (this.selectedClipId === clipId) {
            this.selectedClipId = null;
          }
          break;
        }
      }
      this.renderTimeline();
      this.renderProperties();
      this.renderPreview();
    }

    getClip(clipId) {
      for (const track of this.tracks) {
        const clip = track.clips.find(c => c.id === clipId);
        if (clip) return clip;
      }
      return null;
    }

    getTrackForClip(clipId) {
      for (const track of this.tracks) {
        if (track.clips.find(c => c.id === clipId)) return track;
      }
      return null;
    }

    selectClip(clipId) {
      this.selectedClipId = clipId;
      this.renderTimeline();
      this.renderProperties();
    }

    // ---- Cut Tool ----
    toggleCutMode() {
      this.cutMode = !this.cutMode;
      document.getElementById('btn-cut-tool').classList.toggle('active', this.cutMode);
      document.getElementById('track-lanes').classList.toggle('cut-mode', this.cutMode);
      this.renderTimeline();
    }

    // Split a clip into two at the given timeline position (seconds)
    splitClip(clipId, time) {
      const MIN_PIECE = 0.1;
      const clip = this.getClip(clipId);
      const track = this.getTrackForClip(clipId);
      if (!clip || !track) return;
      if (time <= clip.startTime + MIN_PIECE || time >= clip.endTime - MIN_PIECE) return;

      const media = this.getMedia(clip.mediaId);
      if (!media) return;

      const offset = time - clip.startTime; // duration of the left piece

      const right = new Clip(media, track.type);
      right.startTime = time;
      right.originalDuration = clip.originalDuration;
      right.imageDuration = clip.imageDuration;
      right.trimStart = clip.trimStart + offset;
      right.trimEnd = clip.trimEnd;
      right.volume = clip.volume;
      right.fadeIn = 0;
      right.fadeOut = clip.fadeOut;

      // Left piece keeps its head; the tail is trimmed away at the cut point
      clip.trimEnd = clip.effectiveDuration - clip.trimStart - offset;
      clip.fadeOut = 0;

      const idx = track.clips.indexOf(clip);
      track.clips.splice(idx + 1, 0, right);

      this.selectedClipId = right.id;
      this.renderTimeline();
      this.renderProperties();
      this.renderPreview();
    }

    // ---- Playback ----
    play() {
      if (this.isPlaying) return;
      this.isPlaying = true;
      this.lastFrameTime = performance.now();
      this.ensureAudioContext();
      this.updatePlayButton();
      this.tick();
    }

    pause() {
      this.isPlaying = false;
      if (this.animFrameId) {
        cancelAnimationFrame(this.animFrameId);
        this.animFrameId = null;
      }
      this.stopAllMedia();
      this.updatePlayButton();
    }

    togglePlay() {
      if (this.isPlaying) {
        this.pause();
      } else {
        this.play();
      }
    }

    seek(time) {
      this.currentTime = clamp(time, 0, this.totalDuration);
      this.stopAllMedia();
      this.renderPreview();
      this.updatePlayhead();
      this.updateTimeDisplay();
    }

    skipToStart() {
      this.pause();
      this.seek(0);
    }

    skipToEnd() {
      this.pause();
      this.seek(this.totalDuration);
    }

    tick() {
      if (!this.isPlaying) return;
      const now = performance.now();
      const delta = (now - this.lastFrameTime) / 1000;
      this.lastFrameTime = now;

      this.currentTime += delta;
      if (this.currentTime >= this.totalDuration) {
        this.currentTime = this.totalDuration;
        this.pause();
        return;
      }

      this.renderPreview();
      this.updatePlayhead();
      this.updateTimeDisplay();

      this.animFrameId = requestAnimationFrame(() => this.tick());
    }

    ensureAudioContext() {
      if (!this.audioContext) {
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      }
      if (this.audioContext.state === 'suspended') {
        this.audioContext.resume();
      }
    }

    stopAllMedia() {
      // Stop/pause all clip-level video and audio elements
      for (const track of this.tracks) {
        for (const clip of track.clips) {
          if (clip.element && (clip.mediaType === 'video' || clip.mediaType === 'audio')) {
            try {
              clip.element.pause();
            } catch (e) { /* ignore */ }
          }
        }
      }
    }

    updatePlayButton() {
      const iconPlay = document.getElementById('icon-play');
      const iconPause = document.getElementById('icon-pause');
      if (this.isPlaying) {
        iconPlay.style.display = 'none';
        iconPause.style.display = 'block';
      } else {
        iconPlay.style.display = 'block';
        iconPause.style.display = 'none';
      }
    }

    // ---- Rendering ----
    renderPreview() {
      const ctx = this.previewCtx;
      const w = CANVAS_WIDTH;
      const h = CANVAS_HEIGHT;
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, w, h);

      const t = this.currentTime;

      // Render video tracks bottom to top (last track renders on top)
      const videoTracks = this.tracks.filter(tr => tr.type === 'video');
      for (let i = videoTracks.length - 1; i >= 0; i--) {
        const track = videoTracks[i];
        if (!track.visible || track.muted) continue;

        for (const clip of track.clips) {
          const inRange = t >= clip.startTime && t < clip.endTime;

          if (!inRange) {
            // Pause video clips that are out of range
            if (clip.mediaType === 'video' && clip.element && !clip.element.paused) {
              clip.element.pause();
            }
            continue;
          }

          if (!clip.element) continue;
          const localTime = t - clip.startTime + clip.trimStart;

          if (clip.mediaType === 'video') {
            const video = clip.element;
            if (!this.isPlaying) {
              video.currentTime = localTime;
            } else {
              const diff = Math.abs(video.currentTime - localTime);
              if (diff > 0.3) {
                video.currentTime = localTime;
              }
              if (video.paused) {
                video.muted = true;
                video.play().catch(() => {});
              }
            }
            this.drawVideoFit(ctx, video, w, h);
          } else if (clip.mediaType === 'image') {
            this.drawVideoFit(ctx, clip.element, w, h);
          }
        }
      }

      // Handle audio playback during play
      for (const track of this.tracks) {
        for (const clip of track.clips) {
          if (clip.mediaType !== 'audio' && clip.mediaType !== 'video') continue;
          if (!clip.element) continue;
          // Skip video clips on video tracks for audio (handled separately below)
          if (track.type === 'video' && clip.mediaType !== 'video') continue;

          const inRange = t >= clip.startTime && t < clip.endTime;
          const isMuted = track.muted;

          if (!inRange || isMuted || !this.isPlaying) {
            // Pause audio that is out of range or muted
            if ((clip.mediaType === 'audio' || (track.type === 'video' && clip.mediaType === 'video')) && !clip.element.paused) {
              clip.element.pause();
            }
            continue;
          }

          if (!this.isPlaying) continue;

          const localTime = t - clip.startTime + clip.trimStart;

          // Audio track clips
          if (track.type === 'audio' && clip.mediaType === 'audio') {
            const audio = clip.element;
            // Volume with fade
            let vol = clip.volume / 100;
            const clipLocalTime = t - clip.startTime;
            const dur = clip.duration;
            if (clip.fadeIn > 0 && clipLocalTime < clip.fadeIn) {
              vol *= clipLocalTime / clip.fadeIn;
            }
            if (clip.fadeOut > 0 && (dur - clipLocalTime) < clip.fadeOut) {
              vol *= (dur - clipLocalTime) / clip.fadeOut;
            }
            audio.volume = clamp(vol, 0, 1);

            const diff = Math.abs(audio.currentTime - localTime);
            if (diff > 0.3) {
              audio.currentTime = localTime;
            }
            if (audio.paused) {
              audio.play().catch(() => {});
            }
          }

          // Video clip audio on video tracks
          if (track.type === 'video' && clip.mediaType === 'video') {
            clip.element.muted = false;
            let vol = clip.volume / 100;
            clip.element.volume = clamp(vol, 0, 1);
          }
        }
      }
    }

    drawVideoFit(ctx, source, canvasW, canvasH) {
      const srcW = source.videoWidth || source.naturalWidth || source.width;
      const srcH = source.videoHeight || source.naturalHeight || source.height;
      if (!srcW || !srcH) return;

      const scale = Math.min(canvasW / srcW, canvasH / srcH);
      const dw = srcW * scale;
      const dh = srcH * scale;
      const dx = (canvasW - dw) / 2;
      const dy = (canvasH - dh) / 2;

      try {
        ctx.drawImage(source, dx, dy, dw, dh);
      } catch (e) { /* ignore draw errors */ }
    }

    updateTimeDisplay() {
      document.getElementById('time-display').textContent =
        `${formatTime(this.currentTime)} / ${formatTime(this.totalDuration)}`;
    }

    // ---- Timeline Rendering ----
    renderTimeline() {
      this.renderTrackHeaders();
      this.renderTrackLanes();
      this.renderRuler();
      this.updatePlayhead();
      this.updateTimeDisplay();
    }

    renderTrackHeaders() {
      const container = document.getElementById('track-headers');
      container.innerHTML = '';

      for (const track of this.tracks) {
        const header = document.createElement('div');
        header.className = `track-header ${track.type}`;
        header.dataset.trackId = track.id;

        const muteLabel = track.type === 'video' ? (track.muted ? '&#x1f6ab;' : '&#x1f441;') : (track.muted ? '&#x1f507;' : '&#x1f50a;');

        header.innerHTML = `
          <div class="track-color"></div>
          <div class="track-info">
            <div class="track-name">${track.name}</div>
            <div class="track-type">${track.type === 'video' ? '動画' : '音声'}</div>
          </div>
          <div class="track-actions">
            <button class="btn-icon btn-mute" title="${track.type === 'video' ? '表示/非表示' : 'ミュート'}">${muteLabel}</button>
            <button class="btn-icon btn-remove-track" title="トラック削除">&#x2715;</button>
          </div>
        `;

        header.querySelector('.btn-mute').addEventListener('click', () => {
          track.muted = !track.muted;
          this.renderTimeline();
          this.renderPreview();
        });

        header.querySelector('.btn-remove-track').addEventListener('click', () => {
          if (confirm(`トラック "${track.name}" を削除しますか？`)) {
            this.removeTrack(track.id);
          }
        });

        container.appendChild(header);
      }
    }

    renderTrackLanes() {
      const container = document.getElementById('track-lanes');
      // Keep playhead
      const playhead = document.getElementById('playhead-line');

      container.innerHTML = '';
      container.appendChild(playhead);

      const totalWidth = this.totalDuration * this.pixelsPerSecond + 200;

      for (const track of this.tracks) {
        const lane = document.createElement('div');
        lane.className = `track-lane ${track.type}`;
        lane.dataset.trackId = track.id;

        const inner = document.createElement('div');
        inner.className = 'track-lane-inner';
        inner.style.width = totalWidth + 'px';

        // Drop target
        lane.addEventListener('dragover', (e) => {
          e.preventDefault();
          lane.classList.add('drag-over');
        });
        lane.addEventListener('dragleave', () => {
          lane.classList.remove('drag-over');
        });
        lane.addEventListener('drop', (e) => {
          e.preventDefault();
          lane.classList.remove('drag-over');
          const mediaId = e.dataTransfer.getData('text/media-id');
          if (mediaId) {
            const media = this.getMedia(mediaId);
            if (media) {
              const rect = inner.getBoundingClientRect();
              const x = e.clientX - rect.left;
              const startTime = Math.max(0, x / this.pixelsPerSecond);
              this.addClipToTrack(track.id, media, startTime);
            }
          }
        });

        // Click on lane to seek
        lane.addEventListener('click', (e) => {
          if (e.target === lane || e.target === inner) {
            const rect = inner.getBoundingClientRect();
            const x = e.clientX - rect.left + lane.scrollLeft;
            this.seek(x / this.pixelsPerSecond);
            this.selectClip(null);
          }
        });

        // Render clips
        for (const clip of track.clips) {
          const clipEl = this.createClipElement(clip, track);
          inner.appendChild(clipEl);
        }

        lane.appendChild(inner);
        container.appendChild(lane);
      }

      // Sync scroll with ruler
      container.addEventListener('scroll', () => {
        this.renderRuler();
        this.updatePlayhead();
      });
    }

    createClipElement(clip, track) {
      const el = document.createElement('div');
      el.className = 'clip';

      if (clip.mediaType === 'video') el.classList.add('video-clip');
      else if (clip.mediaType === 'image') el.classList.add('image-clip');
      else el.classList.add('audio-clip');

      if (clip.id === this.selectedClipId) el.classList.add('selected');

      const left = clip.startTime * this.pixelsPerSecond;
      const width = Math.max(clip.duration * this.pixelsPerSecond, 20);

      el.style.left = left + 'px';
      el.style.width = width + 'px';
      el.dataset.clipId = clip.id;

      el.innerHTML = `
        <div class="trim-handle trim-handle-left"></div>
        <span class="clip-label">${clip.name}</span>
        <div class="trim-handle trim-handle-right"></div>
      `;

      // Selection / cut
      el.addEventListener('mousedown', (e) => {
        if (e.target.classList.contains('trim-handle')) return;
        if (this.cutMode) {
          const rect = el.getBoundingClientRect();
          const t = clip.startTime + (e.clientX - rect.left) / this.pixelsPerSecond;
          this.splitClip(clip.id, t);
          e.preventDefault();
          e.stopPropagation();
          return;
        }
        this.selectClip(clip.id);
      });

      // Dragging clip position
      this.setupClipDrag(el, clip);

      // Trim handles
      this.setupTrimHandle(el.querySelector('.trim-handle-left'), clip, 'left');
      this.setupTrimHandle(el.querySelector('.trim-handle-right'), clip, 'right');

      // Right click to delete
      el.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        if (confirm(`クリップ "${clip.name}" を削除しますか？`)) {
          this.removeClip(clip.id);
        }
      });

      return el;
    }

    setupClipDrag(el, clip) {
      let isDragging = false;
      let startX = 0;
      let origStartTime = 0;

      const onMouseDown = (e) => {
        if (e.target.classList.contains('trim-handle')) return;
        if (e.button !== 0) return;
        if (this.cutMode) return;
        isDragging = true;
        startX = e.clientX;
        origStartTime = clip.startTime;
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
        e.preventDefault();
      };

      const onMouseMove = (e) => {
        if (!isDragging) return;
        const dx = e.clientX - startX;
        const dt = dx / this.pixelsPerSecond;
        clip.startTime = Math.max(0, origStartTime + dt);
        this.renderTimeline();
      };

      const onMouseUp = () => {
        isDragging = false;
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
        this.renderPreview();
      };

      el.addEventListener('mousedown', onMouseDown);
    }

    setupTrimHandle(handle, clip, side) {
      let isTrimming = false;
      let startX = 0;
      let origTrimStart = 0;
      let origTrimEnd = 0;
      let origStartTime = 0;

      handle.addEventListener('mousedown', (e) => {
        e.stopPropagation();
        e.preventDefault();
        isTrimming = true;
        startX = e.clientX;
        origTrimStart = clip.trimStart;
        origTrimEnd = clip.trimEnd;
        origStartTime = clip.startTime;

        const onMouseMove = (ev) => {
          if (!isTrimming) return;
          const dx = ev.clientX - startX;
          const dt = dx / this.pixelsPerSecond;

          if (side === 'left') {
            const newTrimStart = clamp(origTrimStart + dt, 0, clip.effectiveDuration - clip.trimEnd - 0.1);
            clip.trimStart = newTrimStart;
            clip.startTime = origStartTime + (newTrimStart - origTrimStart);
          } else {
            const newTrimEnd = clamp(origTrimEnd - dt, 0, clip.effectiveDuration - clip.trimStart - 0.1);
            clip.trimEnd = newTrimEnd;
          }
          this.renderTimeline();
          this.renderProperties();
        };

        const onMouseUp = () => {
          isTrimming = false;
          document.removeEventListener('mousemove', onMouseMove);
          document.removeEventListener('mouseup', onMouseUp);
          this.renderPreview();
        };

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
      });
    }

    renderRuler() {
      const rulerCanvas = document.getElementById('ruler-canvas');
      const container = document.getElementById('timeline-ruler');
      const trackLanes = document.getElementById('track-lanes');

      rulerCanvas.width = container.clientWidth;
      rulerCanvas.height = container.clientHeight || 30;

      const ctx = rulerCanvas.getContext('2d');
      const scrollLeft = trackLanes.scrollLeft;
      const pps = this.pixelsPerSecond;

      ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--bg-surface').trim();
      ctx.fillRect(0, 0, rulerCanvas.width, rulerCanvas.height);

      // Determine tick interval
      let interval = 1;
      if (pps < 30) interval = 5;
      else if (pps < 60) interval = 2;
      else if (pps > 200) interval = 0.5;

      const startSec = Math.floor(scrollLeft / pps / interval) * interval;
      const endSec = (scrollLeft + rulerCanvas.width) / pps;

      ctx.strokeStyle = '#4a4a6a';
      ctx.fillStyle = '#a0a0b0';
      ctx.font = '10px Consolas, monospace';
      ctx.textAlign = 'center';

      for (let t = startSec; t <= endSec + interval; t += interval) {
        const x = t * pps - scrollLeft;
        // Major tick
        ctx.beginPath();
        ctx.moveTo(x, rulerCanvas.height);
        ctx.lineTo(x, rulerCanvas.height - 12);
        ctx.stroke();
        ctx.fillText(formatTime(t), x, 12);

        // Minor ticks
        const minorCount = interval >= 2 ? 4 : 5;
        const minorInterval = interval / minorCount;
        for (let m = 1; m < minorCount; m++) {
          const mx = (t + m * minorInterval) * pps - scrollLeft;
          ctx.beginPath();
          ctx.moveTo(mx, rulerCanvas.height);
          ctx.lineTo(mx, rulerCanvas.height - 6);
          ctx.stroke();
        }
      }

      // Playhead marker on ruler
      const phX = this.currentTime * pps - scrollLeft;
      ctx.fillStyle = '#e94560';
      ctx.beginPath();
      ctx.moveTo(phX - 5, 0);
      ctx.lineTo(phX + 5, 0);
      ctx.lineTo(phX, 10);
      ctx.closePath();
      ctx.fill();
    }

    updatePlayhead() {
      const playhead = document.getElementById('playhead-line');
      const trackLanes = document.getElementById('track-lanes');
      const x = this.currentTime * this.pixelsPerSecond;
      playhead.style.left = x + 'px';
    }

    // ---- Properties Panel ----
    renderProperties() {
      const noSelMsg = document.getElementById('no-selection-msg');
      const propEl = document.getElementById('clip-properties');

      if (!this.selectedClipId) {
        noSelMsg.style.display = 'flex';
        propEl.style.display = 'none';
        return;
      }

      const clip = this.getClip(this.selectedClipId);
      if (!clip) {
        noSelMsg.style.display = 'flex';
        propEl.style.display = 'none';
        return;
      }

      noSelMsg.style.display = 'none';
      propEl.style.display = 'block';

      document.getElementById('prop-clip-name').textContent = clip.name;

      const typeNames = { video: '動画', image: '画像', audio: '音声' };
      document.getElementById('prop-clip-type').textContent = typeNames[clip.mediaType] || clip.mediaType;

      document.getElementById('prop-start-time').value = clip.startTime.toFixed(1);
      document.getElementById('prop-original-duration').textContent = clip.effectiveDuration.toFixed(2) + ' 秒';
      document.getElementById('prop-trim-start').value = clip.trimStart.toFixed(1);
      document.getElementById('prop-trim-end').value = clip.trimEnd.toFixed(1);

      // Image duration section
      const imageSec = document.getElementById('image-duration-section');
      if (clip.mediaType === 'image') {
        imageSec.style.display = 'block';
        document.getElementById('prop-image-duration').value = clip.imageDuration;
      } else {
        imageSec.style.display = 'none';
      }

      // Audio controls
      const audioSec = document.getElementById('audio-controls-section');
      if (clip.mediaType === 'audio' || clip.mediaType === 'video') {
        audioSec.style.display = 'block';
        document.getElementById('prop-volume').value = clip.volume;
        document.getElementById('prop-volume-val').textContent = clip.volume + '%';
        document.getElementById('prop-fade-in').value = clip.fadeIn;
        document.getElementById('prop-fade-out').value = clip.fadeOut;
      } else {
        audioSec.style.display = 'none';
      }
    }

    // ---- Media Library UI ----
    renderMediaLibrary() {
      const list = document.getElementById('media-list');
      list.innerHTML = '';

      // Drop zone always first
      const dropZone = document.createElement('div');
      dropZone.id = 'media-drop-zone';
      dropZone.className = 'drop-zone';
      dropZone.innerHTML = `
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
        <p>ファイルをドラッグ&ドロップ<br>またはクリックしてインポート</p>
        <small>.mov .png .m4a</small>
      `;
      dropZone.addEventListener('click', () => {
        document.getElementById('file-input').click();
      });
      this.setupDropZone(dropZone);
      list.appendChild(dropZone);

      for (const media of this.mediaLibrary) {
        const item = document.createElement('div');
        item.className = 'media-item';
        item.draggable = true;
        item.dataset.mediaId = media.id;

        let iconHtml;
        if (media.thumbnail && media.type === 'image') {
          iconHtml = `<img class="media-thumbnail" src="${media.thumbnail}" alt="">`;
        } else if (media.thumbnail) {
          iconHtml = `<img class="media-thumbnail" src="${media.thumbnail}" alt="">`;
        } else {
          const typeLabel = media.type === 'video' ? 'MOV' : media.type === 'audio' ? 'M4A' : 'PNG';
          iconHtml = `<div class="media-icon type-${media.type}">${typeLabel}</div>`;
        }

        item.innerHTML = `
          ${iconHtml}
          <div class="media-info">
            <div class="media-name" title="${media.name}">${media.name}</div>
            <div class="media-meta">${media.type === 'image' ? '画像' : formatTime(media.duration)}</div>
          </div>
          <span class="media-remove" title="削除">&#x2715;</span>
        `;

        // Drag
        item.addEventListener('dragstart', (e) => {
          e.dataTransfer.setData('text/media-id', media.id);
          e.dataTransfer.effectAllowed = 'copy';
        });

        // Double click to add to first matching track
        item.addEventListener('dblclick', () => {
          const targetTrack = this.tracks.find(t => {
            if (media.type === 'audio') return t.type === 'audio';
            return t.type === 'video';
          });
          if (targetTrack) {
            // Find end of track
            let end = 0;
            for (const c of targetTrack.clips) {
              if (c.endTime > end) end = c.endTime;
            }
            this.addClipToTrack(targetTrack.id, media, end);
          }
        });

        // Remove
        item.querySelector('.media-remove').addEventListener('click', (e) => {
          e.stopPropagation();
          this.removeMedia(media.id);
        });

        list.appendChild(item);
      }
    }

    setupDropZone(el) {
      el.addEventListener('dragover', (e) => {
        e.preventDefault();
        el.classList.add('drag-over');
      });
      el.addEventListener('dragleave', () => {
        el.classList.remove('drag-over');
      });
      el.addEventListener('drop', (e) => {
        e.preventDefault();
        el.classList.remove('drag-over');
        if (e.dataTransfer.files.length > 0) {
          this.importFiles(e.dataTransfer.files);
        }
      });
    }

    // ---- Export (ffmpeg command generation) ----
    exportVideo() {
      document.getElementById('ffmpeg-output-wrap').style.display = 'none';
      document.getElementById('btn-copy-command').style.display = 'none';
      document.getElementById('btn-download-command').style.display = 'none';
      document.getElementById('export-modal').style.display = 'flex';
    }

    generateExportCommand() {
      const [w, h] = document.getElementById('export-resolution').value.split('x').map(Number);
      const fps = parseInt(document.getElementById('export-fps').value);
      const outName = (document.getElementById('export-filename').value || '').trim() || 'output.mp4';

      const cmd = this.buildFfmpegCommand(w, h, fps, outName);
      if (!cmd) {
        alert('タイムラインにクリップがありません');
        return;
      }

      document.getElementById('ffmpeg-command').value = cmd;
      document.getElementById('ffmpeg-output-wrap').style.display = 'block';
      document.getElementById('btn-copy-command').style.display = '';
      document.getElementById('btn-download-command').style.display = '';
    }

    buildFfmpegCommand(w, h, fps, outName) {
      // Format a number without unnecessary trailing zeros
      const fmt = (n) => {
        const s = Number(n).toFixed(3);
        return s.replace(/\.?0+$/, '') || '0';
      };
      // POSIX shell single-quote escaping
      const q = (s) => `'` + String(s).replace(/'/g, `'\\''`) + `'`;

      // Actual timeline length (totalDuration has a 10s floor for the UI)
      let total = 0;
      for (const track of this.tracks) {
        for (const clip of track.clips) {
          if (clip.endTime > total) total = clip.endTime;
        }
      }
      if (total <= 0) return null;

      const inputs = [];   // input argument strings, index = ffmpeg input number
      const vchains = [];  // per-clip video filter chains
      const achains = [];  // per-clip audio filter chains
      const overlays = []; // { label, start, end } in draw order (bottom first)
      let hasSilentVideoNote = false;

      const scalePad = `scale=${w}:${h}:force_original_aspect_ratio=decrease,` +
        `pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1`;

      const addAudioChain = (inIdx, clip) => {
        const n = achains.length;
        const dur = clip.duration;
        let f = `[${inIdx}:a]atrim=start=${fmt(clip.trimStart)}:end=${fmt(clip.originalDuration - clip.trimEnd)},` +
          `asetpts=PTS-STARTPTS,volume=${fmt(clip.volume / 100)}`;
        if (clip.fadeIn > 0) {
          f += `,afade=t=in:st=0:d=${fmt(clip.fadeIn)}`;
        }
        if (clip.fadeOut > 0) {
          f += `,afade=t=out:st=${fmt(Math.max(0, dur - clip.fadeOut))}:d=${fmt(clip.fadeOut)}`;
        }
        f += `,adelay=${Math.round(clip.startTime * 1000)}:all=1[a${n}]`;
        achains.push(f);
      };

      // Video tracks: the preview draws the last track first, so the first
      // track ends up on top. Overlay in the same order (bottom first).
      const videoTracks = this.tracks.filter(t => t.type === 'video');
      for (let ti = videoTracks.length - 1; ti >= 0; ti--) {
        const track = videoTracks[ti];
        if (!track.visible || track.muted) continue;

        const clips = [...track.clips].sort((a, b) => a.startTime - b.startTime);
        for (const clip of clips) {
          const media = this.getMedia(clip.mediaId);
          if (!media || clip.duration <= 0) continue;

          const inIdx = inputs.length;
          const n = overlays.length;

          if (clip.mediaType === 'image') {
            // Turn the still image into a video stream of the clip's length
            inputs.push(`-loop 1 -framerate ${fps} -t ${fmt(clip.duration)} -i ${q(media.name)}`);
            vchains.push(`[${inIdx}:v]fps=${fps},${scalePad},setpts=PTS+${fmt(clip.startTime)}/TB[v${n}]`);
          } else {
            inputs.push(`-i ${q(media.name)}`);
            vchains.push(
              `[${inIdx}:v]trim=start=${fmt(clip.trimStart)}:end=${fmt(clip.originalDuration - clip.trimEnd)},` +
              `setpts=PTS-STARTPTS,fps=${fps},${scalePad},setpts=PTS+${fmt(clip.startTime)}/TB[v${n}]`
            );
            addAudioChain(inIdx, clip);
            hasSilentVideoNote = true;
          }
          overlays.push({ label: `v${n}`, start: clip.startTime, end: clip.endTime });
        }
      }

      // Audio tracks
      for (const track of this.tracks.filter(t => t.type === 'audio')) {
        if (track.muted) continue;
        const clips = [...track.clips].sort((a, b) => a.startTime - b.startTime);
        for (const clip of clips) {
          const media = this.getMedia(clip.mediaId);
          if (!media || clip.duration <= 0) continue;
          const inIdx = inputs.length;
          inputs.push(`-i ${q(media.name)}`);
          addAudioChain(inIdx, clip);
        }
      }

      if (overlays.length === 0 && achains.length === 0) return null;

      // Build filter_complex
      const filters = [];
      filters.push(`color=c=black:s=${w}x${h}:r=${fps}:d=${fmt(total)}[base]`);
      filters.push(...vchains);

      let prev = 'base';
      overlays.forEach((o, i) => {
        const out = i === overlays.length - 1 ? 'vout' : `ov${i}`;
        filters.push(
          `[${prev}][${o.label}]overlay=eof_action=pass:enable='between(t,${fmt(o.start)},${fmt(o.end)})'[${out}]`
        );
        prev = out;
      });
      if (overlays.length === 0) {
        filters.push(`[base]null[vout]`);
      }

      filters.push(...achains);
      if (achains.length === 0) {
        filters.push(`anullsrc=channel_layout=stereo:sample_rate=44100:d=${fmt(total)}[aout]`);
      } else if (achains.length === 1) {
        filters.push(`[a0]anull[aout]`);
      } else {
        const labels = achains.map((_, i) => `[a${i}]`).join('');
        filters.push(`${labels}amix=inputs=${achains.length}:duration=longest:normalize=0[aout]`);
      }

      // Assemble the (multi-line) command
      const lines = [];
      lines.push(`# 出力: ${outName} (${w}x${h}, ${fps}fps, 長さ ${fmt(total)}秒)`);
      lines.push(`# 素材ファイルと同じディレクトリで実行してください。`);
      if (hasSilentVideoNote) {
        lines.push(`# 注意: 音声ストリームを持たない動画クリップがある場合は、対応する [N:a] で始まる行を削除してください。`);
      }
      lines.push('');
      lines.push('ffmpeg -y \\');
      for (const inp of inputs) {
        lines.push(`  ${inp} \\`);
      }
      lines.push('  -filter_complex "');
      filters.forEach((f, i) => {
        lines.push(`    ${f}${i < filters.length - 1 ? ';' : ''}`);
      });
      lines.push('  " \\');
      lines.push('  -map "[vout]" -map "[aout]" \\');
      lines.push(`  -c:v libx264 -preset medium -crf 18 -pix_fmt yuv420p -r ${fps} \\`);
      lines.push('  -c:a aac -b:a 192k \\');
      lines.push(`  -t ${fmt(total)} \\`);
      lines.push(`  ${q(outName)}`);

      return lines.join('\n');
    }

    copyExportCommand() {
      const textarea = document.getElementById('ffmpeg-command');
      const done = () => {
        const btn = document.getElementById('btn-copy-command');
        const orig = btn.textContent;
        btn.textContent = 'コピーしました';
        setTimeout(() => { btn.textContent = orig; }, 1500);
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(textarea.value).then(done).catch(() => {
          textarea.select();
          document.execCommand('copy');
          done();
        });
      } else {
        textarea.select();
        document.execCommand('copy');
        done();
      }
    }

    downloadExportCommand() {
      const cmd = document.getElementById('ffmpeg-command').value;
      const blob = new Blob(['#!/bin/sh\n\n' + cmd + '\n'], { type: 'text/x-shellscript' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'export_ffmpeg.sh';
      a.click();
      URL.revokeObjectURL(url);
    }

    // ---- Event Listeners ----
    initEventListeners() {
      // Import
      document.getElementById('btn-import').addEventListener('click', () => {
        document.getElementById('file-input').click();
      });

      document.getElementById('file-input').addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
          this.importFiles(e.target.files);
          e.target.value = '';
        }
      });

      // Drop zone
      const dropZone = document.getElementById('media-drop-zone');
      if (dropZone) {
        dropZone.addEventListener('click', () => {
          document.getElementById('file-input').click();
        });
        this.setupDropZone(dropZone);
      }

      // Whole page drop
      document.body.addEventListener('dragover', (e) => {
        e.preventDefault();
      });
      document.body.addEventListener('drop', (e) => {
        e.preventDefault();
        if (e.dataTransfer.files.length > 0) {
          this.importFiles(e.dataTransfer.files);
        }
      });

      // Add tracks
      document.getElementById('btn-add-video-track').addEventListener('click', () => {
        const count = this.tracks.filter(t => t.type === 'video').length + 1;
        this.addTrack('video', `動画 ${count}`);
      });

      document.getElementById('btn-add-audio-track').addEventListener('click', () => {
        const count = this.tracks.filter(t => t.type === 'audio').length + 1;
        this.addTrack('audio', `音声 ${count}`);
      });

      // Transport
      document.getElementById('btn-play').addEventListener('click', () => this.togglePlay());
      document.getElementById('btn-skip-start').addEventListener('click', () => this.skipToStart());
      document.getElementById('btn-skip-end').addEventListener('click', () => this.skipToEnd());

      // Keyboard shortcuts
      document.addEventListener('keydown', (e) => {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') return;

        switch (e.code) {
          case 'KeyC':
            this.toggleCutMode();
            break;
          case 'KeyS':
            if (this.selectedClipId) {
              this.splitClip(this.selectedClipId, this.currentTime);
            }
            break;
          case 'Space':
            e.preventDefault();
            this.togglePlay();
            break;
          case 'Home':
            this.skipToStart();
            break;
          case 'End':
            this.skipToEnd();
            break;
          case 'Delete':
          case 'Backspace':
            if (this.selectedClipId) {
              this.removeClip(this.selectedClipId);
            }
            break;
          case 'ArrowLeft':
            this.seek(this.currentTime - (e.shiftKey ? 1 : 0.1));
            break;
          case 'ArrowRight':
            this.seek(this.currentTime + (e.shiftKey ? 1 : 0.1));
            break;
        }
      });

      // Zoom
      document.getElementById('timeline-zoom').addEventListener('input', (e) => {
        this.zoomLevel = parseInt(e.target.value);
        this.renderTimeline();
      });

      // Ruler click to seek
      document.getElementById('timeline-ruler').addEventListener('click', (e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const trackLanes = document.getElementById('track-lanes');
        const time = (x + trackLanes.scrollLeft) / this.pixelsPerSecond;
        this.seek(time);
      });

      // Properties inputs
      document.getElementById('prop-start-time').addEventListener('change', (e) => {
        const clip = this.getClip(this.selectedClipId);
        if (clip) {
          clip.startTime = Math.max(0, parseFloat(e.target.value) || 0);
          this.renderTimeline();
          this.renderPreview();
        }
      });

      document.getElementById('prop-trim-start').addEventListener('change', (e) => {
        const clip = this.getClip(this.selectedClipId);
        if (clip) {
          const val = Math.max(0, parseFloat(e.target.value) || 0);
          clip.trimStart = Math.min(val, clip.effectiveDuration - clip.trimEnd - 0.1);
          this.renderTimeline();
          this.renderProperties();
          this.renderPreview();
        }
      });

      document.getElementById('prop-trim-end').addEventListener('change', (e) => {
        const clip = this.getClip(this.selectedClipId);
        if (clip) {
          const val = Math.max(0, parseFloat(e.target.value) || 0);
          clip.trimEnd = Math.min(val, clip.effectiveDuration - clip.trimStart - 0.1);
          this.renderTimeline();
          this.renderProperties();
          this.renderPreview();
        }
      });

      document.getElementById('prop-image-duration').addEventListener('change', (e) => {
        const clip = this.getClip(this.selectedClipId);
        if (clip && clip.mediaType === 'image') {
          clip.imageDuration = Math.max(0.5, parseFloat(e.target.value) || 5);
          this.renderTimeline();
          this.renderPreview();
        }
      });

      document.getElementById('prop-volume').addEventListener('input', (e) => {
        const clip = this.getClip(this.selectedClipId);
        if (clip) {
          clip.volume = parseInt(e.target.value);
          document.getElementById('prop-volume-val').textContent = clip.volume + '%';
        }
      });

      document.getElementById('prop-fade-in').addEventListener('change', (e) => {
        const clip = this.getClip(this.selectedClipId);
        if (clip) {
          clip.fadeIn = Math.max(0, parseFloat(e.target.value) || 0);
        }
      });

      document.getElementById('prop-fade-out').addEventListener('change', (e) => {
        const clip = this.getClip(this.selectedClipId);
        if (clip) {
          clip.fadeOut = Math.max(0, parseFloat(e.target.value) || 0);
        }
      });

      // Export
      document.getElementById('btn-export').addEventListener('click', () => this.exportVideo());
      document.getElementById('btn-export-start').addEventListener('click', () => this.generateExportCommand());
      document.getElementById('btn-copy-command').addEventListener('click', () => this.copyExportCommand());
      document.getElementById('btn-download-command').addEventListener('click', () => this.downloadExportCommand());
      document.getElementById('btn-export-cancel').addEventListener('click', () => {
        document.getElementById('export-modal').style.display = 'none';
      });

      // Cut tool
      document.getElementById('btn-cut-tool').addEventListener('click', () => this.toggleCutMode());

      // Window resize
      window.addEventListener('resize', () => {
        this.renderRuler();
      });
    }
  }

  // ---- Initialize ----
  window.addEventListener('DOMContentLoaded', () => {
    window.editor = new Editor();
  });
})();
