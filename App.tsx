
import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { Song, Show, View, StagedSong, AppSettings } from './types';
import { PlusIcon, MusicNoteIcon, RadioIcon, TrashIcon, ListIcon, ChevronLeftIcon, TvIcon, GripVerticalIcon, ReplaceIcon, SettingsIcon } from './components/icons';
import Modal from './components/Modal';
import useLocalStorage from './hooks/useLocalStorage';
import SongPlayer from './components/SongPlayer';

declare const jsmediatags: any;

const TAG_READING_TIMEOUT_MS = 10000; 
const DURATION_READING_TIMEOUT_MS = 20000; 

const formatDuration = (totalSeconds?: number): string => {
  if (totalSeconds === undefined || isNaN(totalSeconds) || totalSeconds < 0) return "00:00";
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
};

const promiseWithTimeout = <T,>(
  promise: Promise<T>,
  ms: number,
  timeoutError: Error
): Promise<T> => {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(timeoutError);
    }, ms);

    promise
      .then(value => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch(err => {
        clearTimeout(timer);
        reject(err);
      });
  });
};

// Light Neumorphic Styles (base bg-slate-100: #F1F5F9)
// Light shadow: white (#FFFFFF), Dark shadow: slate-300 (#CBD5E1)
const neumorphicBaseLight = 'bg-slate-100 rounded-xl transition-all duration-200 ease-in-out';
const neumorphicTextLight = 'text-slate-700';
const neumorphicSubtleTextLight = 'text-slate-500';
const neumorphicAccentTextLight = 'text-sky-600';

const neumorphicOutsetLight = `${neumorphicBaseLight} shadow-[5px_5px_10px_#cbd5e1,-5px_-5px_10px_#ffffff]`;
const neumorphicInsetLight = `${neumorphicBaseLight} shadow-[inset_5px_5px_10px_#cbd5e1,inset_-5px_-5px_10px_#ffffff]`;
const neumorphicOutsetSoftLight = `${neumorphicBaseLight} shadow-[3px_3px_6px_#cbd5e1,-3px_-3px_6px_#ffffff]`;
const neumorphicInsetSoftLight = `${neumorphicBaseLight} shadow-[inset_3px_3px_6px_#cbd5e1,inset_-3px_-3px_6px_#ffffff]`;
const neumorphicActiveLight = `${neumorphicBaseLight} shadow-[inset_5px_5px_10px_#cbd5e1,inset_-5px_-5px_10px_#ffffff]`;
const neumorphicActiveSoftLight = `${neumorphicBaseLight} shadow-[inset_3px_3px_6px_#cbd5e1,inset_-3px_-3px_6px_#ffffff]`;

// Simplified Neumorphic Styles (Light Mode Only)
const neumorphicText = neumorphicTextLight;
const neumorphicSubtleText = neumorphicSubtleTextLight;
const neumorphicAccentText = neumorphicAccentTextLight;

const neumorphicOutset = neumorphicOutsetLight;
const neumorphicInset = neumorphicInsetLight;
const neumorphicOutsetSoft = neumorphicOutsetSoftLight;
const neumorphicInsetSoft = neumorphicInsetSoftLight;
const neumorphicActive = neumorphicActiveLight;
const neumorphicActiveSoft = neumorphicActiveSoftLight;


const neumorphicButtonBase = `font-medium py-2.5 px-5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400 focus:ring-opacity-60 disabled:opacity-60 disabled:cursor-not-allowed ${neumorphicText}`;
const neumorphicButton = `${neumorphicButtonBase} ${neumorphicOutsetLight} hover:shadow-[7px_7px_14px_#cbd5e1,-7px_-7px_14px_#ffffff] active:${neumorphicActiveLight} disabled:shadow-[5px_5px_10px_#cbd5e1,-5px_-5px_10px_#ffffff]`;
const neumorphicIconButton = `${neumorphicButtonBase} ${neumorphicOutsetSoftLight} p-2.5 hover:shadow-[4px_4px_8px_#cbd5e1,-4px_-4px_8px_#ffffff] active:${neumorphicActiveSoftLight} disabled:shadow-[3px_3px_6px_#cbd5e1,-3px_-3px_6px_#ffffff]`;

const neumorphicInput = `bg-slate-100 ${neumorphicInsetLight} block w-full px-3 py-2.5 text-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-400 focus:ring-opacity-50 ${neumorphicText}`;


const App: React.FC = () => {
  const [songs, setSongs] = useLocalStorage<Song[]>('radioShowPlanner_songs_neumorphic_v2_light', []);
  const [shows, setShows] = useLocalStorage<Show[]>('radioShowPlanner_shows_neumorphic_v2_light', []);
  const [currentView, setCurrentView] = useState<View>(View.SONGS);
  const [selectedShowId, setSelectedShowId] = useState<string | null>(null);

  const [appSettings, setAppSettings] = useLocalStorage<AppSettings>('radioShowPlanner_settings_neumorphic_v2_light', {
    targetSongMinutesPerHour: 52,
    showCreationMode: 'duration',
    targetSongsPerHour: 12,
  });

  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [stagedSongs, setStagedSongs] = useState<StagedSong[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const audioFileCache = useRef<Map<string, File>>(new Map());

  const [draggedSongId, setDraggedSongId] = useState<string | null>(null);
  const [dragOverItemId, setDragOverItemId] = useState<string | null>(null);

  const [isReplaceSongModalOpen, setIsReplaceSongModalOpen] = useState(false);
  const [songToReplaceDetails, setSongToReplaceDetails] = useState<{ showId: string; songId: string; originalSongTitle: string; } | null>(null);
  const [replacementSuggestions, setReplacementSuggestions] = useState<Song[]>([]);

  const [isSwapPlaylistModalOpen, setIsSwapPlaylistModalOpen] = useState(false);
  
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [isCreateShowModalOpen, setIsCreateShowModalOpen] = useState(false);
  const [newShowHours, setNewShowHours] = useState<number>(1);

  const getSongById = useCallback((songId: string): Song | undefined => {
    return songs.find(s => s.id === songId);
  }, [songs]);

  const calculateShowTotalDuration = useCallback((songIds: string[]): number => {
    return songIds.reduce((acc, id) => {
      const song = getSongById(id);
      return acc + (song?.durationSeconds || 0);
    }, 0);
  }, [getSongById]);

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files) return;

    const newStagedSongsInitialData = Array.from(files).map(file => {
      try {
        const tempId = crypto.randomUUID();
        if (!file || !file.name) {
            console.error("A selected file is invalid or has no name.", file);
            return null;
        }
        return { tempId, file, fileName: file.name };
      } catch (e) {
        console.error("Error processing a selected file (e.g., accessing name or creating ID):", file, e);
        return null;
      }
    }).filter(Boolean) as { tempId: string; file: File; fileName: string }[]; 

    if (newStagedSongsInitialData.length === 0 && files.length > 0) {
        alert("Could not process any of the selected files. Please check the console for errors.");
        if (fileInputRef.current) {
          fileInputRef.current.value = ""; 
        }
        return;
    }
    
    setStagedSongs(prev => [
        ...prev,
        ...newStagedSongsInitialData.map(data => ({
            tempId: data.tempId,
            file: data.file,
            fileName: data.fileName,
            title: '',
            artist: '',
            isLoading: true,
            durationSeconds: 0,
            error: undefined,
        }))
    ]);
    
    for (const { tempId, file, fileName } of newStagedSongsInitialData) {
      console.log(`[${fileName}] Starting metadata processing.`);
      let title = '';
      let artist = '';
      let tagsError = '';
      let duration = 0;
      let durationErrorMsg = '';

      try {
        const tagsPromise = new Promise((resolve, reject) => {
          jsmediatags.read(file, { onSuccess: resolve, onError: reject });
        });
        const tagsResult = await promiseWithTimeout(
          tagsPromise, 
          TAG_READING_TIMEOUT_MS,
          new Error('Tag reading timed out.')
        );
        title = (tagsResult as any).tags.title || '';
        artist = (tagsResult as any).tags.artist || '';
        if (!title && !artist) { 
             tagsError = 'No title/artist tags found.';
        }
      } catch (err: any) {
        tagsError = err.message || 'Could not read tags.';
      }

      let audioForDuration: HTMLAudioElement | null = null;
      let objectUrlForDurationFile: string | null = null;

      try {
        const durationPromiseInternal = new Promise<number>((resolve, reject) => {
          audioForDuration = new Audio();
          audioForDuration.preload = 'metadata';
          
          try {
            objectUrlForDurationFile = URL.createObjectURL(file);
          } catch (urlError) {
            reject(new Error('Failed to create Object URL.'));
            return;
          }
          
          audioForDuration.src = objectUrlForDurationFile;

          audioForDuration.onloadedmetadata = () => {
            if (audioForDuration && isFinite(audioForDuration.duration)) {
              resolve(Math.round(audioForDuration.duration));
            } else {
              reject(new Error('Invalid duration value (e.g., Infinity).'));
            }
          };

          audioForDuration.onerror = () => {
            let errorMsg = 'Audio error.';
            if (audioForDuration && audioForDuration.error) {
                switch (audioForDuration.error.code) {
                  case audioForDuration.error.MEDIA_ERR_DECODE: errorMsg = 'Audio decoding error.'; break;
                  default: errorMsg = `Audio error (code ${audioForDuration.error.code}).`;
                }
            }
            reject(new Error(errorMsg));
          };
        });

        duration = await promiseWithTimeout(
            durationPromiseInternal,
            DURATION_READING_TIMEOUT_MS,
            new Error('Duration reading timed out.')
        );
      } catch (err: any) {
        durationErrorMsg = err.message || 'Could not read duration.';
      } finally {
        if (audioForDuration) {
          audioForDuration.onloadedmetadata = null;
          audioForDuration.onerror = null;
          if (audioForDuration.src && audioForDuration.src.startsWith('blob:')) {
            audioForDuration.pause();
            audioForDuration.removeAttribute('src'); 
          }
          audioForDuration = null; 
        }
        if (objectUrlForDurationFile) {
          URL.revokeObjectURL(objectUrlForDurationFile);
          objectUrlForDurationFile = null;
        }
      }
      
      setStagedSongs(prev => prev.map(s => {
        if (s.tempId === tempId) {
          const combinedError = [tagsError, durationErrorMsg].filter(Boolean).join(' ');
          return {
            ...s,
            title: title || s.title, 
            artist: artist || s.artist, 
            durationSeconds: duration > 0 ? duration : (s.durationSeconds || 0),
            isLoading: false, 
            error: combinedError || undefined,
          };
        }
        return s;
      }));
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = ""; 
    }
  };

  const handleUpdateStagedSong = (tempId: string, field: 'title' | 'artist', value: string) => {
    setStagedSongs(prev => prev.map(s => s.tempId === tempId ? { ...s, [field]: value } : s));
  };

  const handleRemoveStagedSong = (tempId: string) => {
    setStagedSongs(prev => prev.filter(s => s.tempId !== tempId));
  };

  const handleClearStagedSongs = () => {
    setStagedSongs([]);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleImportStagedSongs = () => {
    if (stagedSongs.some(s => s.isLoading)) {
        alert("Some songs are still loading metadata. Please wait.");
        return;
    }

    if (stagedSongs.length === 0) {
        alert("No songs selected to import."); 
        return;
    }

    const songsToAdd: Song[] = [];
    const songsToUpdate: Song[] = [];
    const filesToCacheForNew: { id: string; file: File }[] = [];
    const filesToCacheForUpdate: { id: string; file: File }[] = [];
    const songsNeedingManualInput: StagedSong[] = [];

    let importedCount = 0;
    let updatedCount = 0;
    let needsManualInputCount = 0;
    let errorSkippedCount = 0;
    let userSkippedOverwriteCount = 0;

    for (const sSong of stagedSongs) {
        if (!sSong.title.trim() || !sSong.artist.trim()) {
            if (!sSong.error) {
                needsManualInputCount++;
                songsNeedingManualInput.push(sSong);
            } else {
                errorSkippedCount++;
            }
            continue; 
        }

        const existingSongIndex = songs.findIndex(
            libSong => libSong.title.trim().toLowerCase() === sSong.title.trim().toLowerCase() &&
                       libSong.artist.trim().toLowerCase() === sSong.artist.trim().toLowerCase()
        );

        if (existingSongIndex !== -1) {
            const existingSong = songs[existingSongIndex];
            const confirmOverwrite = window.confirm(
`A song titled "${sSong.title.trim()}" by "${sSong.artist.trim()}" already exists in your library.
Existing - Uploaded: ${new Date(existingSong.uploadedAt).toLocaleDateString()}, Duration: ${formatDuration(existingSong.durationSeconds)}, File: ${existingSong.fileName || 'N/A'}.

Do you want to overwrite it with this new version?
New - File: ${sSong.fileName}, Duration: ${formatDuration(sSong.durationSeconds)}.

Overwriting updates the audio and details but keeps its show history.`
            );

            if (confirmOverwrite) {
                const updatedSongData: Song = {
                    ...existingSong, 
                    fileName: sSong.fileName,
                    durationSeconds: sSong.durationSeconds || 0,
                    uploadedAt: Date.now(), 
                };
                songsToUpdate.push(updatedSongData);
                filesToCacheForUpdate.push({ id: existingSong.id, file: sSong.file });
                updatedCount++;
            } else {
                userSkippedOverwriteCount++;
            }
        } else { 
            const newSongId = crypto.randomUUID();
            songsToAdd.push({
                id: newSongId,
                title: sSong.title.trim(),
                artist: sSong.artist.trim(),
                fileName: sSong.fileName,
                uploadedAt: Date.now(),
                lastUsedInShowDetails: null,
                durationSeconds: sSong.durationSeconds || 0,
            });
            filesToCacheForNew.push({ id: newSongId, file: sSong.file });
            importedCount++;
        }
    }

    if (songsToAdd.length > 0 || songsToUpdate.length > 0) {
        setSongs(prevSongs => {
            let newSongList = [...prevSongs];
            songsToUpdate.forEach(updatedS => {
                const index = newSongList.findIndex(s => s.id === updatedS.id);
                if (index !== -1) {
                    newSongList[index] = updatedS;
                }
            });
            newSongList = [...newSongList, ...songsToAdd];
            return newSongList;
        });

        filesToCacheForNew.forEach(item => audioFileCache.current.set(item.id, item.file));
        filesToCacheForUpdate.forEach(item => audioFileCache.current.set(item.id, item.file));
    }

    const alertMessages: string[] = [];
    if (importedCount > 0) alertMessages.push(`${importedCount} new song(s) imported successfully!`);
    if (updatedCount > 0) alertMessages.push(`${updatedCount} existing song(s) overwritten successfully!`);
    if (userSkippedOverwriteCount > 0) alertMessages.push(`${userSkippedOverwriteCount} song(s) were not overwritten by your choice.`);
    if (needsManualInputCount > 0) {
        alertMessages.push(`${needsManualInputCount} song(s) still require a title and/or artist. Please fill them in.`);
    }
    if (errorSkippedCount > 0) {
        alertMessages.push(`${errorSkippedCount} song(s) were skipped due to metadata errors and missing information.`);
    }
    if (alertMessages.length === 0 && stagedSongs.length > 0) {
      alertMessages.push("No songs were imported or updated. Check details or try re-adding files.");
    }

    if (alertMessages.length > 0) {
        alert(alertMessages.join("\n\n"));
    }

    if (needsManualInputCount > 0) {
        setStagedSongs(songsNeedingManualInput); 
    } else {
        setStagedSongs([]);
        setIsImportModalOpen(false);
        if (fileInputRef.current) {
            fileInputRef.current.value = "";
        }
    }
  };

  const isSongInAnyShow = useCallback((songId: string): boolean => {
    return shows.some(show => show.songIds.includes(songId));
  }, [shows]);

  const handleDeleteSongFromLibrary = useCallback((songId: string) => {
    if (isSongInAnyShow(songId)) {
      alert('This song is part of a show history and cannot be deleted from the library while it is in use. Remove it from all shows first or delete the shows it belongs to.');
      return;
    }
    if (window.confirm('Are you sure you want to delete this song from the library? This action cannot be undone.')) {
      setSongs(prevSongs => {
        const newSongs = prevSongs.filter(song => song.id !== songId);
        audioFileCache.current.delete(songId);
        return newSongs;
      });
    }
  }, [setSongs, isSongInAnyShow]);
  
  const handleDeleteShow = useCallback((showIdToDelete: string) => {
    const showToDelete = shows.find(s => s.id === showIdToDelete);
    if (!showToDelete) {
        console.error("handleDeleteShow: Could not find the show to delete with ID:", showIdToDelete);
        alert("Error: Could not find the show to delete.");
        return;
    }
    console.log("handleDeleteShow: Attempting to delete show:", showToDelete.name, showIdToDelete);
    if (window.confirm(`Are you sure you want to delete "${showToDelete.name || "this show"}"? This action cannot be undone.`)) {
        console.log("handleDeleteShow: User confirmed deletion for show ID:", showIdToDelete);
        const initialShowCount = shows.length;
        setShows(prevShows => {
            const updatedShows = prevShows.filter(show => show.id !== showIdToDelete);
            console.log(`handleDeleteShow: Shows count before delete: ${initialShowCount}, after filter: ${updatedShows.length}. Target ID: ${showIdToDelete}`);
            return updatedShows;
        });
        if (selectedShowId === showIdToDelete) {
            console.log("handleDeleteShow: Cleared selectedShowId as it was the deleted show.");
            setSelectedShowId(null);
        }
    } else {
        console.log("handleDeleteShow: User cancelled deletion for show ID:", showIdToDelete);
    }
  }, [shows, setShows, selectedShowId, setSelectedShowId]);


  const sortedShows = useMemo(() => [...shows].sort((a, b) => b.createdAt - a.createdAt), [shows]);

  const getSongAvailability = useCallback((song: Song): { isAvailable: boolean; reason?: string } => {
    if (!song.lastUsedInShowDetails) {
      return { isAvailable: true };
    }
    const lastUsedShowExists = shows.some(s => s.id === song.lastUsedInShowDetails?.showId);
   
    if (sortedShows.length < 4) {
      if (lastUsedShowExists) {
        return { isAvailable: false, reason: `Used in "${shows.find(s => s.id === song.lastUsedInShowDetails?.showId)?.name}" (fewer than 4 total shows exist).` };
      } else {
         return { isAvailable: true }; 
      }
    }

    const fourthMostRecentShow = sortedShows[3]; 

    if (lastUsedShowExists && song.lastUsedInShowDetails.showCreatedAt >= fourthMostRecentShow.createdAt) {
      return { isAvailable: false, reason: `Recently used in "${shows.find(s => s.id === song.lastUsedInShowDetails?.showId)?.name}". Available after more shows.` };
    }
    
    return { isAvailable: true };
  }, [sortedShows, shows]);

  const availableSongs = useMemo(() => songs.filter(song => getSongAvailability(song).isAvailable), [songs, getSongAvailability]);
  
  const usableSongsForNewShow = useMemo(() => 
    availableSongs.filter(song => song.durationSeconds && song.durationSeconds > 0)
  , [availableSongs]);

  const handleConfirmCreateShow = useCallback((hours: number) => {
    const { targetSongMinutesPerHour, showCreationMode, targetSongsPerHour } = appSettings;

    if (usableSongsForNewShow.length === 0) {
        alert("No available songs with duration to create a show.");
        setIsCreateShowModalOpen(false);
        return;
    }

    const shuffledUsableSongs = [...usableSongsForNewShow].sort(() => 0.5 - Math.random());
    let currentShowSongIds: string[] = [];
    let currentTotalDuration = 0;
    let alertMessage = "";

    const MAX_TOTAL_DURATION_SECONDS_CAP = targetSongMinutesPerHour * hours * 60;

    if (showCreationMode === 'duration') {
        const MIN_TOTAL_SHOW_DURATION_SECONDS = Math.max(5 * 60 * hours, (targetSongMinutesPerHour - 2) * hours * 60);
        const MAX_TOTAL_SHOW_DURATION_SECONDS_TARGET = (targetSongMinutesPerHour + 2) * hours * 60;

        for (const song of shuffledUsableSongs) {
            if (currentTotalDuration + song.durationSeconds <= MAX_TOTAL_SHOW_DURATION_SECONDS_TARGET) {
                currentShowSongIds.push(song.id);
                currentTotalDuration += song.durationSeconds;
            }
        }
        if (currentTotalDuration < MIN_TOTAL_SHOW_DURATION_SECONDS) {
            alertMessage = `Could not create a show of at least ${formatDuration(MIN_TOTAL_SHOW_DURATION_SECONDS)}. Best attempt for ${hours}hr(s): ${formatDuration(currentTotalDuration)} with ${currentShowSongIds.length} songs.`;
        }
    } else { 
        const TARGET_SONG_COUNT = targetSongsPerHour * hours;
        for (const song of shuffledUsableSongs) {
            if (currentShowSongIds.length < TARGET_SONG_COUNT) {
                if (currentTotalDuration + song.durationSeconds <= MAX_TOTAL_DURATION_SECONDS_CAP) {
                    currentShowSongIds.push(song.id);
                    currentTotalDuration += song.durationSeconds;
                } else {
                    break; 
                }
            } else {
                break;
            }
        }
        if (currentShowSongIds.length < TARGET_SONG_COUNT) {
             alertMessage = `Targeted ${TARGET_SONG_COUNT} songs, but only selected ${currentShowSongIds.length} with a total duration of ${formatDuration(currentTotalDuration)}. This might be due to the duration cap of ${formatDuration(MAX_TOTAL_DURATION_SECONDS_CAP)} or insufficient songs.`;
        }
         if (currentShowSongIds.length === 0 && usableSongsForNewShow.length > 0) {
            alertMessage = `Could not select any songs for a ${hours}hr show targeting ${TARGET_SONG_COUNT} songs. Available songs might be too long for the cap of ${formatDuration(MAX_TOTAL_DURATION_SECONDS_CAP)}.`;
        }
    }

    if (alertMessage && currentShowSongIds.length === 0) { 
        alert(alertMessage);
        setIsCreateShowModalOpen(false);
        return;
    }
     if (alertMessage && currentShowSongIds.length > 0 ) { 
        alert(alertMessage + "\nA show will still be created with the selected songs.");
    }

    const newShowName = `Radio Show (${hours}hr) - ${new Date().toLocaleDateString()}`;
    const newShowCreatedAt = Date.now();
    const newShowId = crypto.randomUUID();
    const newShow: Show = {
      id: newShowId,
      name: newShowName,
      createdAt: newShowCreatedAt,
      songIds: currentShowSongIds,
      totalDurationSeconds: currentTotalDuration,
      intendedHours: hours,
    };

    setShows(prevShows => [...prevShows, newShow]);
    setSongs(prevSongs =>
      prevSongs.map(song =>
        currentShowSongIds.includes(song.id) ? { ...song, lastUsedInShowDetails: { showId: newShow.id, showCreatedAt: newShowCreatedAt } } : song
      )
    );
    
    if (!alertMessage) { 
      alert(`Show "${newShowName}" created with ${currentShowSongIds.length} songs, total duration: ${formatDuration(currentTotalDuration)}.`);
    }
    
    setIsCreateShowModalOpen(false);
    setNewShowHours(1); 
  }, [usableSongsForNewShow, setSongs, setShows, appSettings]); 

  const selectedShow = useMemo(() => {
    if (!selectedShowId) return null;
    const show = shows.find(show => show.id === selectedShowId);
    if (!show) return null;
    
    const currentTotalDuration = calculateShowTotalDuration(show.songIds);
    const intendedHours = show.intendedHours || 1; 
    return {...show, totalDurationSeconds: currentTotalDuration, intendedHours };
  }, [selectedShowId, shows, calculateShowTotalDuration]); 


  const handleDragStartSongInShow = (e: React.DragEvent<HTMLLIElement>, songId: string) => {
    setDraggedSongId(songId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', songId); 
  };

  const handleDragOverSongInShow = (e: React.DragEvent<HTMLLIElement>, targetSongId: string) => {
    e.preventDefault(); 
    if (targetSongId !== draggedSongId) {
      setDragOverItemId(targetSongId);
    }
  };

  const handleDragLeaveSongInShow = () => {
    setDragOverItemId(null);
  };

  const handleDropSongInShow = (e: React.DragEvent<HTMLLIElement>, targetSongId: string) => {
    e.preventDefault();
    setDragOverItemId(null);
    if (!draggedSongId || draggedSongId === targetSongId || !selectedShowId) {
      setDraggedSongId(null);
      return;
    }

    const currentShow = shows.find(s => s.id === selectedShowId);
    if (!currentShow) {
      setDraggedSongId(null);
      return;
    }

    let newSongIds = [...currentShow.songIds];
    const draggedItemOriginalIndex = newSongIds.indexOf(draggedSongId);

    if (draggedItemOriginalIndex === -1) { 
      setDraggedSongId(null);
      return;
    }
    
    const [draggedItem] = newSongIds.splice(draggedItemOriginalIndex, 1);
    const targetItemNewIndex = newSongIds.indexOf(targetSongId);

    if (targetItemNewIndex === -1) { 
       newSongIds.push(draggedItem); 
    } else {
       newSongIds.splice(targetItemNewIndex, 0, draggedItem);
    }
    
    const newTotalDuration = calculateShowTotalDuration(newSongIds);
    setShows(prevShows =>
      prevShows.map(s =>
        s.id === selectedShowId ? { ...s, songIds: newSongIds, totalDurationSeconds: newTotalDuration } : s
      )
    ); 
    setDraggedSongId(null);
  };

  const handleDragEndSongInShow = () => {
    setDraggedSongId(null);
    setDragOverItemId(null);
  };

  const handleOpenSwapPlaylistModal = () => {
    if (!selectedShowId) return;
    setIsSwapPlaylistModalOpen(true);
  };

  const handleConfirmSwapEntireShowPlaylist = () => {
    if (!selectedShowId) return;

    const showToUpdate = shows.find(s => s.id === selectedShowId);
    if (!showToUpdate) {
        alert("Error: Could not find the selected show to update.");
        setIsSwapPlaylistModalOpen(false);
        return;
    }
    const showId = showToUpdate.id;
    const showCreatedAt = showToUpdate.createdAt;
    const hoursForSwap = showToUpdate.intendedHours || 1;

    const { targetSongMinutesPerHour, showCreationMode, targetSongsPerHour } = appSettings;

    if (usableSongsForNewShow.length === 0) {
      alert("No available songs with duration to swap the playlist.");
      setIsSwapPlaylistModalOpen(false);
      return;
    }

    const shuffledUsableSongs = [...usableSongsForNewShow].sort(() => 0.5 - Math.random());
    let newSongIds: string[] = [];
    let newTotalDuration = 0;
    let alertMessage = "";

    const MAX_TOTAL_DURATION_SECONDS_CAP_SWAP = targetSongMinutesPerHour * hoursForSwap * 60;

    if (showCreationMode === 'duration') {
        const MIN_SWAP_DURATION_SECONDS = Math.max(5 * 60 * hoursForSwap, (targetSongMinutesPerHour - 2) * hoursForSwap * 60);
        const MAX_SWAP_DURATION_SECONDS_TARGET = (targetSongMinutesPerHour + 2) * hoursForSwap * 60;
        
        for (const song of shuffledUsableSongs) {
            if (newTotalDuration + song.durationSeconds <= MAX_SWAP_DURATION_SECONDS_TARGET) {
                newSongIds.push(song.id);
                newTotalDuration += song.durationSeconds;
            }
        }
        if (newTotalDuration < MIN_SWAP_DURATION_SECONDS) {
            alertMessage = `Could not create a replacement playlist of at least ${formatDuration(MIN_SWAP_DURATION_SECONDS)}. Best attempt: ${formatDuration(newTotalDuration)} with ${newSongIds.length} songs.`;
        }
    } else { 
        const TARGET_SONG_COUNT_SWAP = targetSongsPerHour * hoursForSwap;
        for (const song of shuffledUsableSongs) {
            if (newSongIds.length < TARGET_SONG_COUNT_SWAP) {
                if (newTotalDuration + song.durationSeconds <= MAX_TOTAL_DURATION_SECONDS_CAP_SWAP) {
                    newSongIds.push(song.id);
                    newTotalDuration += song.durationSeconds;
                } else {
                    break;
                }
            } else {
                break;
            }
        }
        if (newSongIds.length < TARGET_SONG_COUNT_SWAP) {
            alertMessage = `Targeted ${TARGET_SONG_COUNT_SWAP} songs for swap, but only selected ${newSongIds.length} with duration ${formatDuration(newTotalDuration)}.`;
        }
         if (newSongIds.length === 0 && usableSongsForNewShow.length > 0) {
            alertMessage = `Could not select any songs for swap. Available songs might be too long for the duration cap of ${formatDuration(MAX_TOTAL_DURATION_SECONDS_CAP_SWAP)}.`;
        }
    }

    if (alertMessage && newSongIds.length === 0) {
        alert(alertMessage);
        setIsSwapPlaylistModalOpen(false);
        return;
    }
    if (alertMessage && newSongIds.length > 0) {
        alert(alertMessage + "\nPlaylist will be swapped with these songs.");
    }

    setShows(prevShows => prevShows.map(s => {
      if (s.id === showId) {
        return { ...s, songIds: newSongIds, totalDurationSeconds: newTotalDuration };
      }
      return s;
    }));

    setSongs(prevSongs =>
      prevSongs.map(song =>
        newSongIds.includes(song.id) ? { ...song, lastUsedInShowDetails: { showId, showCreatedAt } } : song
      )
    );
    
    if (!alertMessage) {
        alert(`Playlist for "${showToUpdate.name}" (${hoursForSwap}hr) swapped with ${newSongIds.length} songs, total duration: ${formatDuration(newTotalDuration)}.`);
    }
    setIsSwapPlaylistModalOpen(false);
  };


  const handleOpenReplaceSongModal = (songIdToReplace: string) => {
    if (!selectedShowId) {
        alert("Error: No show is currently selected to replace a song in.");
        return;
    }
    const currentShow = shows.find(s => s.id === selectedShowId);
    const songToReplaceData = getSongById(songIdToReplace);

    if (!currentShow || !songToReplaceData) {
        alert("Error: Could not find the show or song details.");
        return;
    }
    
    console.log(`handleOpenReplaceSongModal for song ID: ${songIdToReplace} in show ID: ${selectedShowId}`);
    let suggestionLog = "Replacement suggestions filtering:\n";
    const suggestions = songs.filter(song => {
      const availability = getSongAvailability(song);
      const isItself = song.id === songIdToReplace;
      const otherSongsInCurrentShow = currentShow.songIds.filter(id => id !== songIdToReplace);
      const isAlreadyInShow = otherSongsInCurrentShow.includes(song.id);
      const hasDuration = song.durationSeconds !== undefined && song.durationSeconds > 0;
      
      let logEntry = `  Song: ${song.title} (ID: ${song.id})\n`;
      logEntry += `    Available: ${availability.isAvailable} (Reason: ${availability.reason || 'N/A'})\n`;
      logEntry += `    Is Itself: ${isItself}\n`;
      logEntry += `    Already in Show (other than itself): ${isAlreadyInShow}\n`;
      logEntry += `    Has Duration: ${hasDuration}\n`;

      const shouldInclude = availability.isAvailable && !isItself && !isAlreadyInShow && hasDuration;
      logEntry += `    -> Included: ${shouldInclude}\n`;
      suggestionLog += logEntry;
      
      return shouldInclude;
    }).sort((a, b) => a.title.localeCompare(b.title));

    console.log(suggestionLog);
    console.log(`Found ${suggestions.length} suggestions.`);
    
    if (suggestions.length === 0) {
      let summary = `No replacement suggestions found. Breakdown:\n`;
      summary += `Total songs in library: ${songs.length}\n`;
      
      let availableCount = 0;
      let notItselfCount = 0;
      let notInShowCount = 0;
      let hasDurationCount = 0;

      songs.forEach(song => {
          if (getSongAvailability(song).isAvailable) availableCount++;
          if (song.id !== songIdToReplace) notItselfCount++;
          const otherSongsInCurrentShow = currentShow.songIds.filter(id => id !== songIdToReplace);
          if (!otherSongsInCurrentShow.includes(song.id)) notInShowCount++;
          if (song.durationSeconds !== undefined && song.durationSeconds > 0) hasDurationCount++;
      });
      summary += `Songs passing availability: ${availableCount}\n`;
      summary += `Songs passing 'not itself': ${notItselfCount}\n`;
      summary += `Songs passing 'not already in show': ${notInShowCount}\n`;
      summary += `Songs passing 'has duration': ${hasDurationCount}\n`;
      console.log(summary);
    }


    setReplacementSuggestions(suggestions);
    setSongToReplaceDetails({ showId: selectedShowId, songId: songIdToReplace, originalSongTitle: songToReplaceData.title });
    setIsReplaceSongModalOpen(true);
  };

  const handleConfirmReplaceSong = (newSongId: string) => {
    if (!songToReplaceDetails) return;
    const { showId, songId: oldSongId } = songToReplaceDetails;
    const showToUpdate = shows.find(s => s.id === showId);
    if (!showToUpdate) return; 

    const showCreatedAt = showToUpdate.createdAt;

    setShows(prevShows => prevShows.map(s => {
      if (s.id === showId) {
        const oldSongIndex = s.songIds.indexOf(oldSongId);
        if (oldSongIndex === -1) return s; 

        const newSongIds = [...s.songIds];
        newSongIds.splice(oldSongIndex, 1, newSongId);
        const newTotalDuration = calculateShowTotalDuration(newSongIds);
        return { ...s, songIds: newSongIds, totalDurationSeconds: newTotalDuration };
      }
      return s;
    }));

    setSongs(prevSongs => prevSongs.map(song => {
      if (song.id === newSongId) {
        return { ...song, lastUsedInShowDetails: { showId, showCreatedAt }};
      }
      return song;
    }));

    setIsReplaceSongModalOpen(false);
    setSongToReplaceDetails(null);
  };

  const handleTargetMinutesChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value, 10);
    if (value >= 10 && value <= 60) {
      setAppSettings(prev => ({ ...prev, targetSongMinutesPerHour: value }));
    }
  };
  
  const handleShowCreationModeChange = (mode: 'duration' | 'count') => {
    setAppSettings(prev => ({ ...prev, showCreationMode: mode }));
  };

  const handleTargetSongsPerHourChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value, 10);
    if (value >= 1 && value <= 20) { 
      setAppSettings(prev => ({ ...prev, targetSongsPerHour: value }));
    }
  };

  const handleNewShowHoursChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value, 10);
    if (value >= 1) { 
        setNewShowHours(value);
    }
  };

  // Neumorphic styled input field
  const NeumorphicInputField = ({id, label, type = "text", value, onChange, disabled, placeholder, helperText, className } : 
    {id:string, label?:string, type?:string, value:string|number, onChange:(e: React.ChangeEvent<HTMLInputElement>)=>void, disabled?:boolean, placeholder?:string, helperText?:string, className?:string}) => (
    <div className={`relative ${className}`}>
      {label && (
        <label htmlFor={id} className={`block text-sm font-medium mb-1.5 ${neumorphicSubtleText}`}>
          {label}
        </label>
      )}
      <input
        type={type}
        id={id}
        value={value}
        onChange={onChange}
        disabled={disabled}
        placeholder={placeholder}
        className={`${neumorphicInput} ${disabled ? 'opacity-70 cursor-not-allowed' : ''}`}
      />
      {helperText && <p className={`mt-1 text-xs ${neumorphicSubtleText}`}>{helperText}</p>}
    </div>
  );


  const renderSongsView = () => (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-center">
        <h2 className={`text-2xl font-semibold ${neumorphicText}`}>Song Library</h2>
        <button
          onClick={() => setIsImportModalOpen(true)}
          className={`${neumorphicButton} flex items-center mt-4 sm:mt-0`}
        >
          <PlusIcon className="w-5 h-5 mr-2" />
          Import Songs
        </button>
      </div>
      {songs.length === 0 ? (
        <p className={`${neumorphicSubtleText} text-center py-10`}>Your song library is empty. Import some songs to get started!</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {songs.map(song => {
            const availability = getSongAvailability(song);
            const canDelete = !isSongInAnyShow(song.id);

            return (
            <div key={song.id} className={`${neumorphicOutsetSoft} p-4 ${!availability.isAvailable ? 'opacity-70' : 'hover:shadow-[7px_7px_14px_#cbd5e1,-7px_-7px_14px_#ffffff]'}`}>
              <div className="flex justify-between items-start">
                <div className="flex-grow min-w-0">
                  <h3 className={`text-lg font-semibold ${neumorphicAccentText} truncate`} title={song.title}>{song.title}</h3>
                  <p className={`${neumorphicSubtleText} text-sm truncate`} title={song.artist}>{song.artist}</p>
                  <p className={`text-sm ${neumorphicSubtleText} mt-1`}>Duration: {formatDuration(song.durationSeconds)}</p>
                  {song.fileName && <p className="text-xs text-slate-400 mt-1 truncate" title={song.fileName}>File: {song.fileName}</p>}
                </div>
                {canDelete && (
                  <button
                    onClick={() => handleDeleteSongFromLibrary(song.id)}
                    className={`${neumorphicIconButton} -mt-1 -mr-1 text-red-500 hover:text-red-600`}
                    aria-label="Delete song from library"
                  >
                    <TrashIcon className="w-5 h-5" />
                  </button>
                )}
              </div>
              <p className="text-xs text-slate-400 mt-2">Uploaded: {new Date(song.uploadedAt).toLocaleDateString()}</p>
              {!availability.isAvailable && song.lastUsedInShowDetails && (
                <p className="text-xs text-amber-600 mt-1" title={availability.reason}>
                  Recently used in: {shows.find(s => s.id === song.lastUsedInShowDetails?.showId)?.name || 'a show'}
                </p>
              )}
               {availability.isAvailable && song.lastUsedInShowDetails && (
                 <p className="text-xs text-green-600 mt-1">
                    Available (last used in {shows.find(s => s.id === song.lastUsedInShowDetails?.showId)?.name || 'a show'})
                 </p>
               )}
            </div>
          );
        })}
        </div>
      )}
    </div>
  );

  const renderShowsView = () => (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-center">
        <h2 className={`text-2xl font-semibold ${neumorphicText}`}>Radio Shows</h2>
        <button
          onClick={() => setIsCreateShowModalOpen(true)}
          disabled={usableSongsForNewShow.length === 0}
          className={`${neumorphicButton} flex items-center mt-4 sm:mt-0`}
          title={usableSongsForNewShow.length === 0 ? "No available songs with duration." : `Create new show. ${usableSongsForNewShow.length} usable songs available.`}
        >
          <PlusIcon className="w-5 h-5 mr-2" />
          Create Show ({usableSongsForNewShow.length})
        </button>
      </div>
      {shows.length === 0 ? (
        <p className={`${neumorphicSubtleText} text-center py-10`}>No shows created yet. Create one to plan your radio program!</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {shows.map(show => (
            <div key={show.id} className={`${neumorphicOutsetSoft} p-4 flex flex-col justify-between hover:shadow-[7px_7px_14px_#cbd5e1,-7px_-7px_14px_#ffffff]`}>
              <div>
                <h3 className={`text-lg font-semibold text-sky-700 truncate`} title={show.name}>{show.name}</h3>
                <p className={`${neumorphicSubtleText} text-sm`}>Created: {new Date(show.createdAt).toLocaleDateString()}</p>
                <p className={`${neumorphicSubtleText} text-sm`}>{show.songIds.length} songs ({show.intendedHours || 1}hr show)</p>
                <p className={`${neumorphicSubtleText} text-sm`}>Duration: {formatDuration(show.totalDurationSeconds)}</p>
              </div>
              <div className="mt-4 flex items-center justify-start pt-3">
                <button
                  onClick={() => { setSelectedShowId(show.id); setCurrentView(View.SHOWS); }}
                  className={`${neumorphicButtonBase} ${neumorphicOutsetSoftLight} text-xs px-3 py-1.5 active:${neumorphicActiveSoftLight} hover:shadow-[4px_4px_8px_#cbd5e1,-4px_-4px_8px_#ffffff]`}
                >
                  View Details
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const renderShowDetailView = () => {
    if (!selectedShow) return <p className={`${neumorphicSubtleText}`}>Show not found.</p>;
    
    const allShowSongs = selectedShow.songIds.map(id => getSongById(id)).filter(Boolean) as Song[];
    const intendedHours = selectedShow.intendedHours || 1;
    const targetDurationPerConceptualHour = appSettings.targetSongMinutesPerHour * 60;
    const hourlySegments: Array<{ hour: number; songs: Song[]; totalDurationSeconds: number }> = [];

    if (intendedHours > 1 && allShowSongs.length > 0) {
        let currentSegmentSongs: Song[] = [];
        let currentSegmentDuration = 0;
        let hourCounter = 1;

        for (const song of allShowSongs) {
            if (currentSegmentDuration > 0 && 
                (currentSegmentDuration + (song.durationSeconds || 0)) > targetDurationPerConceptualHour && 
                hourCounter < intendedHours &&
                currentSegmentSongs.length > 0) { 
                
                hourlySegments.push({
                    hour: hourCounter,
                    songs: currentSegmentSongs,
                    totalDurationSeconds: currentSegmentDuration,
                });
                hourCounter++;
                currentSegmentSongs = [song];
                currentSegmentDuration = song.durationSeconds || 0;
            } else {
                currentSegmentSongs.push(song);
                currentSegmentDuration += (song.durationSeconds || 0);
            }
        }
        if (currentSegmentSongs.length > 0) {
            hourlySegments.push({
                hour: hourCounter,
                songs: currentSegmentSongs,
                totalDurationSeconds: currentSegmentDuration,
            });
        }
        while (hourlySegments.length < intendedHours) {
            hourlySegments.push({
                hour: hourlySegments.length + 1,
                songs: [],
                totalDurationSeconds: 0,
            });
        }
    } else { 
        hourlySegments.push({
            hour: 1,
            songs: allShowSongs,
            totalDurationSeconds: selectedShow.totalDurationSeconds || calculateShowTotalDuration(allShowSongs.map(s=>s.id)),
        });
        if (allShowSongs.length === 0) {
            for (let i = 2; i <= intendedHours; i++) {
                hourlySegments.push({ hour: i, songs: [], totalDurationSeconds: 0 });
            }
        }
    }
        
    return (
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-3">
            <div className="flex items-center">
                <button
                    onClick={() => setSelectedShowId(null)} 
                    className={`${neumorphicIconButton} mr-2`}
                    aria-label="Back to shows list"
                >
                    <ChevronLeftIcon className="w-6 h-6" />
                </button>
                <h2 className={`text-2xl font-semibold ${neumorphicText}`}>{selectedShow.name}</h2>
            </div>
             <div className="flex space-x-2">
                <button
                    onClick={handleOpenSwapPlaylistModal}
                    disabled={usableSongsForNewShow.length === 0}
                    className={`${neumorphicButton} flex items-center text-xs`}
                    title={usableSongsForNewShow.length === 0 ? "No usable songs available to swap playlist" : `Swap entire playlist`}
                >
                    <ReplaceIcon className="w-4 h-4 mr-1.5" />
                    Swap Playlist
                </button>
            </div>
        </div>

        <div className={`${neumorphicOutsetSoft} p-4 text-sm ${neumorphicSubtleText} space-y-1`}>
            <p>Created: {new Date(selectedShow.createdAt).toLocaleString()}</p>
            <p className={`font-semibold ${neumorphicText}`}>Total Duration: {formatDuration(selectedShow.totalDurationSeconds)}</p>
            <p>Intended Length: {selectedShow.intendedHours || 1} hour(s)</p>
        </div>
        
        <h3 className={`text-xl font-semibold ${neumorphicAccentText} mt-6 mb-2`}>Songs ({allShowSongs.length}):</h3>
        
        {hourlySegments.map((segment, index) => (
          <div key={`hour-segment-${segment.hour}`} className="mt-3">
             <div className={`${neumorphicOutsetSoft} rounded-t-xl p-3 mb-0.5 sticky top-0 bg-slate-100 z-10`}>
                <h4 className={`text-lg font-semibold ${neumorphicText}`}>
                Hour {segment.hour} 
                <span className={`text-xs font-normal ${neumorphicSubtleText} ml-2`}>
                    (Songs: {segment.songs.length}, Duration: {formatDuration(segment.totalDurationSeconds)})
                </span>
                </h4>
            </div>
            {segment.songs.length > 0 ? (
              <ul className="space-y-2">
                {segment.songs.map(song => {
                  const audioFile = audioFileCache.current.get(song.id);
                  return (
                    <li 
                      key={song.id}
                      draggable={true}
                      onDragStart={(e) => handleDragStartSongInShow(e, song.id)}
                      onDragOver={(e) => handleDragOverSongInShow(e, song.id)}
                      onDragLeave={handleDragLeaveSongInShow}
                      onDrop={(e) => handleDropSongInShow(e, song.id)}
                      onDragEnd={handleDragEndSongInShow}
                      className={`${neumorphicOutsetSoft} p-3 flex flex-col sm:flex-row items-start sm:items-center justify-between group
                                  ${draggedSongId === song.id ? `opacity-40 ring-2 ring-sky-500 ${neumorphicActiveSoft}` : ''}
                                  ${dragOverItemId === song.id && draggedSongId !== song.id ? `ring-2 ring-sky-400 ring-offset-1` : ''}`}
                      aria-grabbed={draggedSongId === song.id}
                    >
                      <div className="flex items-center flex-grow min-w-0 mb-2 sm:mb-0">
                        <button
                          className={`${neumorphicIconButton} cursor-grab mr-1.5 -ml-1 sm:mr-2 flex-shrink-0 p-1.5`}
                          aria-label={`Drag to reorder ${song.title}`}
                          title={`Drag to reorder ${song.title}`}
                        >
                          <GripVerticalIcon className="w-5 h-5" />
                        </button>
                        <div className="flex-grow truncate mr-2"> 
                            <p className={`text-md font-semibold ${neumorphicAccentText} truncate`} title={song.title}>{song.title}</p>
                            <p className={`${neumorphicSubtleText} text-xs truncate`} title={song.artist}>{song.artist}</p>
                            <p className="text-xs text-slate-400">Duration: {formatDuration(song.durationSeconds)}</p>
                        </div>
                      </div>
                      <div className="flex items-center space-x-1 flex-shrink-0 w-full sm:w-auto justify-end">
                        <button
                            onClick={() => handleOpenReplaceSongModal(song.id)}
                            className={`${neumorphicIconButton} text-amber-600 hover:text-amber-700`}
                            aria-label={`Replace ${song.title}`}
                            title={`Replace ${song.title}`}
                        >
                            <ReplaceIcon className="w-5 h-5" />
                        </button>
                        {audioFile ? (
                            <div className="min-w-[180px] max-w-xs flex-grow sm:flex-grow-0">
                                <SongPlayer file={audioFile} />
                            </div>
                        ) : (
                            <p className="text-xs text-orange-600 py-2 px-1 flex-shrink-0 whitespace-nowrap">Preview N/A</p>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className={`${neumorphicSubtleText} italic text-sm p-3 ${neumorphicInsetSoft} rounded-b-xl`}>No songs in this hour segment.</p>
            )}
          </div>
        ))}
         {allShowSongs.length === 0 && hourlySegments.every(seg => seg.songs.length === 0) && (
          <p className={`${neumorphicSubtleText} mt-4 p-3 ${neumorphicInsetSoft}`}>No songs in this show. Use 'Swap Entire Playlist' to add songs.</p>
        )}
      </div>
    );
  };

  const renderReplaceSongModal = () => {
    if (!isReplaceSongModalOpen || !songToReplaceDetails) return null;
    const songBeingReplaced = getSongById(songToReplaceDetails.songId);

    return (
        <Modal 
            isOpen={isReplaceSongModalOpen} 
            onClose={() => { setIsReplaceSongModalOpen(false); setSongToReplaceDetails(null); }} 
            title={`Replace Song`}
            size="lg"
            actions={
                <>
                    <button type="button" onClick={() => { setIsReplaceSongModalOpen(false); setSongToReplaceDetails(null); }} className={`${neumorphicButton}`}>
                        Cancel
                    </button>
                </>
            }
        >
            <div className={`space-y-4 ${neumorphicText}`}>
                {songBeingReplaced && (
                    <div className={`p-3 ${neumorphicInsetSoft}`}>
                        <p className={`text-sm ${neumorphicSubtleText}`}>Replacing:</p>
                        <p className={`font-semibold ${neumorphicAccentText}`}>{songBeingReplaced.title}</p>
                        <p className={`text-xs ${neumorphicSubtleText}`}>{songBeingReplaced.artist} - {formatDuration(songBeingReplaced.durationSeconds)}</p>
                    </div>
                )}
                <h4 className="text-md font-medium pt-2">Available Songs for Replacement:</h4>
                {replacementSuggestions.length > 0 ? (
                    <ul className="space-y-2 max-h-60 overflow-y-auto pr-1">
                        {replacementSuggestions.map(suggestion => (
                            <li key={suggestion.id} className={`flex justify-between items-center p-2.5 ${neumorphicOutsetSoft} hover:shadow-[4px_4px_8px_#cbd5e1,-4px_-4px_8px_#ffffff]`}>
                                <div>
                                    <p className={`font-medium ${neumorphicText}`}>{suggestion.title}</p>
                                    <p className={`text-sm ${neumorphicSubtleText}`}>{suggestion.artist} - {formatDuration(suggestion.durationSeconds)}</p>
                                </div>
                                <button
                                    onClick={() => handleConfirmReplaceSong(suggestion.id)}
                                    className={`${neumorphicButton} text-xs px-3 py-1.5`}
                                >
                                    Select
                                </button>
                            </li>
                        ))}
                    </ul>
                ) : (
                    <p className={`${neumorphicSubtleText}`}>No suitable replacement songs available.</p>
                )}
            </div>
        </Modal>
    );
  };

  const renderSwapPlaylistModal = () => {
    if (!isSwapPlaylistModalOpen || !selectedShow) return null;
    const hoursForSwap = selectedShow.intendedHours || 1;
    let description = "";
    if (appSettings.showCreationMode === 'duration') {
        const targetTotalMinutes = appSettings.targetSongMinutesPerHour * hoursForSwap;
        description = `Replace all songs in "${selectedShow.name}" (${hoursForSwap}hr show) aiming for ~${targetTotalMinutes} minutes of music.`;
    } else { 
        const targetTotalSongs = appSettings.targetSongsPerHour * hoursForSwap;
        const durationCapMinutes = appSettings.targetSongMinutesPerHour * hoursForSwap;
        description = `Replace all songs in "${selectedShow.name}" (${hoursForSwap}hr show) aiming for ~${targetTotalSongs} songs, capped at ${durationCapMinutes} minutes.`;
    }

    return (
        <Modal
            isOpen={isSwapPlaylistModalOpen}
            onClose={() => setIsSwapPlaylistModalOpen(false)}
            title={`Swap Playlist for "${selectedShow.name}"`}
            size="md"
            actions={
                <>
                    <button type="button" onClick={() => setIsSwapPlaylistModalOpen(false)} className={`${neumorphicButton}`}>
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={handleConfirmSwapEntireShowPlaylist}
                        disabled={usableSongsForNewShow.length === 0}
                        className={`${neumorphicButton} ${usableSongsForNewShow.length > 0 ? 'text-amber-700' : ''}`}
                    >
                        Proceed
                    </button>
                </>
            }
        >
            <div className={`space-y-3 ${neumorphicText}`}>
                <p className={`${neumorphicSubtleText}`}>{description}</p>
                <p className={`text-sm ${neumorphicSubtleText}`}>
                    Current: {selectedShow.songIds.length} songs, {formatDuration(selectedShow.totalDurationSeconds)}.
                </p>
                <p className={`text-sm ${neumorphicSubtleText}`}>
                    {usableSongsForNewShow.length} usable songs available for new playlist.
                </p>
            </div>
        </Modal>
    );
  };

  const renderSettingsModal = () => {
    if (!isSettingsModalOpen) return null;

    return (
        <Modal
            isOpen={isSettingsModalOpen}
            onClose={() => setIsSettingsModalOpen(false)}
            title="Application Settings"
            size="md" 
            actions={
                <button type="button" onClick={() => setIsSettingsModalOpen(false)} className={`${neumorphicButton}`}>
                    Done
                </button>
            }
        >
            <div className={`space-y-6 ${neumorphicText}`}>
                <div>
                    <label className="block text-sm font-medium mb-2">
                        Show Creation Mode:
                    </label>
                    <div className="flex space-x-4">
                        {([['duration', 'By Duration'], ['count', 'By Song Count']] as const).map(([modeVal, modeLabel]) => (
                            <label key={modeVal} className={`flex items-center space-x-2 cursor-pointer p-2 rounded-lg ${appSettings.showCreationMode === modeVal ? `${neumorphicInsetSoftLight}` : `${neumorphicOutsetSoftLight}`}`}>
                                <input
                                    type="radio"
                                    name="showCreationMode"
                                    value={modeVal}
                                    checked={appSettings.showCreationMode === modeVal}
                                    onChange={() => handleShowCreationModeChange(modeVal)}
                                    className={`opacity-0 w-0 h-0 peer`} // Hidden, label handles click
                                />
                                <span className={`w-4 h-4 rounded-full ${neumorphicOutsetSoftLight} flex items-center justify-center peer-checked:${neumorphicInsetSoftLight}`}>
                                  {appSettings.showCreationMode === modeVal && <span className="w-2 h-2 bg-sky-500 rounded-full"></span>}
                                </span>
                                <span className={`text-sm ${neumorphicSubtleText}`}>{modeLabel}</span>
                            </label>
                        ))}
                    </div>
                </div>

                <div>
                    <label htmlFor="targetMinutes" className="block text-sm font-medium mb-1">
                        Target Song Minutes Per Hour: <span className={`font-semibold ${neumorphicAccentText}`}>{appSettings.targetSongMinutesPerHour} min</span>
                    </label>
                    <div className={`${neumorphicInsetSoft} p-1 rounded-lg`}>
                      <input
                          type="range"
                          id="targetMinutes"
                          min="10"
                          max="60"
                          value={appSettings.targetSongMinutesPerHour}
                          onChange={handleTargetMinutesChange}
                          className={`w-full h-2.5 bg-transparent rounded-lg appearance-none cursor-pointer accent-sky-500 range-thumb-neumorphic`}
                      />
                    </div>
                    <p className={`text-xs ${neumorphicSubtleText} mt-1.5`}>
                        {appSettings.showCreationMode === 'duration' 
                         ? "Desired music content per hour." 
                         : "Max duration cap per hour for 'By Song Count' mode."}
                    </p>
                </div>

                {appSettings.showCreationMode === 'count' && (
                    <div>
                        <label htmlFor="targetSongs" className="block text-sm font-medium mb-1">
                            Target Songs Per Hour: <span className={`font-semibold ${neumorphicAccentText}`}>{appSettings.targetSongsPerHour} songs</span>
                        </label>
                        <div className={`${neumorphicInsetSoft} p-1 rounded-lg`}>
                          <input
                              type="range"
                              id="targetSongs"
                              min="1"
                              max="20" 
                              value={appSettings.targetSongsPerHour}
                              onChange={handleTargetSongsPerHourChange}
                              className={`w-full h-2.5 bg-transparent rounded-lg appearance-none cursor-pointer accent-sky-500 range-thumb-neumorphic`}
                          />
                        </div>
                         <p className={`text-xs ${neumorphicSubtleText} mt-1.5`}>
                            Target songs per hour, capped by "Target Song Minutes Per Hour".
                        </p>
                        {appSettings.targetSongsPerHour > 15 && (
                             <p className="text-xs text-orange-500 mt-1">
                                High song count may be hard to achieve due to duration cap.
                             </p>
                        )}
                    </div>
                )}
            </div>
        </Modal>
    );
  };

  const renderCreateShowModal = () => {
    if (!isCreateShowModalOpen) return null;

    let descriptionText = "";
    if (appSettings.showCreationMode === 'duration') {
        const calculatedTargetMin = (appSettings.targetSongMinutesPerHour - 2) * newShowHours;
        const calculatedTargetMax = (appSettings.targetSongMinutesPerHour + 2) * newShowHours;
        descriptionText = `Aim for ~${formatDuration(calculatedTargetMin*60)} to ${formatDuration(calculatedTargetMax*60)} of songs.`;
    } else { 
        const targetTotalSongs = appSettings.targetSongsPerHour * newShowHours;
        const durationCapMinutes = appSettings.targetSongMinutesPerHour * newShowHours;
        descriptionText = `Aim for ~${targetTotalSongs} songs, capped at ${formatDuration(durationCapMinutes*60)}.`;
    }

    return (
        <Modal
            isOpen={isCreateShowModalOpen}
            onClose={() => { setIsCreateShowModalOpen(false); setNewShowHours(1);}}
            title="Setup New Show"
            size="md"
            actions={
                <>
                 <button type="button" onClick={() => { setIsCreateShowModalOpen(false); setNewShowHours(1);}} className={`${neumorphicButton}`}>
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={() => handleConfirmCreateShow(newShowHours)}
                        disabled={usableSongsForNewShow.length === 0}
                        className={`${neumorphicButton}`}
                    >
                        Create {newShowHours}hr Show
                    </button>
                </>
            }
        >
            <div className={`space-y-4 ${neumorphicText}`}>
                <NeumorphicInputField 
                    id="showHours" 
                    label="Show Length (hours)" 
                    type="number" 
                    value={newShowHours} 
                    onChange={handleNewShowHoursChange}
                />
                <div className={`p-3 ${neumorphicInsetSoft} text-sm`}>
                    <p className={`${neumorphicSubtleText}`}>
                        This {newShowHours}-hour show: {descriptionText}
                    </p>
                    <p className={`text-xs text-slate-400 mt-1`}>
                        ({usableSongsForNewShow.length} usable songs available)
                    </p>
                </div>
            </div>
        </Modal>
    );
  };


  return (
    <div className="min-h-screen bg-slate-100 text-slate-700 pb-10">
      <header className={`bg-slate-100 mb-8 pt-4 pb-3`}>
        <div className="container mx-auto flex flex-col sm:flex-row justify-between items-center p-4">
          <div className={`flex items-center space-x-3 mb-3 sm:mb-0 p-3 rounded-xl ${neumorphicOutsetSoft}`}>
            <RadioIcon className={`w-8 h-8 ${neumorphicAccentText}`} />
            <h1 className={`text-2xl font-semibold ${neumorphicText}`}>
              Radio Show Planner
            </h1>
          </div>
          <nav className={`flex space-x-2 p-1.5 rounded-xl ${neumorphicOutsetSoft}`}>
            <button
              onClick={() => { setCurrentView(View.SONGS); setSelectedShowId(null); }}
              className={`${neumorphicButtonBase} px-3 py-2 flex items-center space-x-1.5 
                ${currentView === View.SONGS && !selectedShowId ? `${neumorphicActiveSoftLight}` : `${neumorphicOutsetSoftLight} hover:shadow-[4px_4px_8px_#cbd5e1,-4px_-4px_8px_#ffffff]`}`}
            >
              <MusicNoteIcon className="w-4 h-4" />
              <span>Library</span>
            </button>
            <button
              onClick={() => { setCurrentView(View.SHOWS); setSelectedShowId(null); }}
              className={`${neumorphicButtonBase} px-3 py-2 flex items-center space-x-1.5 
                ${currentView === View.SHOWS && !selectedShowId ? `${neumorphicActiveSoftLight}` : `${neumorphicOutsetSoftLight} hover:shadow-[4px_4px_8px_#cbd5e1,-4px_-4px_8px_#ffffff]`}`}
            >
              <TvIcon className="w-4 h-4" /> 
              <span>Shows</span>
            </button>
            <button
              onClick={() => setIsSettingsModalOpen(true)}
              className={`${neumorphicIconButton} p-2`}
              aria-label="Open Settings"
              title="Application Settings"
            >
              <SettingsIcon className="w-5 h-5" />
            </button>
          </nav>
        </div>
      </header>

      <main className="container mx-auto p-4">
        {selectedShowId ? renderShowDetailView() : (currentView === View.SONGS ? renderSongsView() : renderShowsView())}
      </main>

      <Modal 
        isOpen={isImportModalOpen} 
        onClose={() => { setIsImportModalOpen(false); setStagedSongs([]); if(fileInputRef.current) fileInputRef.current.value = ""; }} 
        title="Import MP3 Songs" 
        size="xl"
        actions={
            <>
                <button type="button" onClick={handleClearStagedSongs} disabled={stagedSongs.length === 0} className={`${neumorphicButton} ${stagedSongs.length === 0 ? 'opacity-50 !shadow-[3px_3px_6px_#cbd5e1,-3px_-3px_6px_#ffffff]' : ''}`}>
                    Clear ({stagedSongs.length})
                </button>
                <button type="button" onClick={() => { setIsImportModalOpen(false); setStagedSongs([]); if(fileInputRef.current) fileInputRef.current.value = "";}} className={`${neumorphicButton}`}>
                    Cancel
                </button>
                <button
                  type="button"
                  onClick={handleImportStagedSongs}
                  disabled={stagedSongs.some(s => s.isLoading) || (stagedSongs.length > 0 && stagedSongs.filter(s => s.title.trim() && s.artist.trim() && !s.isLoading).length === 0)}
                  className={`${neumorphicButton} ${(stagedSongs.some(s => s.isLoading) || (stagedSongs.length > 0 && stagedSongs.filter(s => s.title.trim() && s.artist.trim() && !s.isLoading).length === 0)) ? 'opacity-50 !shadow-[5px_5px_10px_#cbd5e1,-5px_-5px_10px_#ffffff]' : ''}`}
                  title={stagedSongs.some(s => s.isLoading) ? "Waiting for songs to load..." : (stagedSongs.length > 0 && stagedSongs.filter(s => s.title.trim() && s.artist.trim() && !s.isLoading).length === 0 ? "No valid songs to import (ensure title/artist)" : "Import valid songs")}
                >
                  Import
                </button>
            </>
        }
      >
        <div className={`space-y-4 ${neumorphicText}`}>
          <div>
            <label htmlFor="mp3Files" className={`block text-sm font-medium mb-1.5 ${neumorphicSubtleText}`}>Select MP3 Files</label>
            <div className={`${neumorphicInsetLight} rounded-lg p-0.5`}>
              <input
                type="file"
                id="mp3Files"
                ref={fileInputRef}
                accept=".mp3"
                multiple
                onChange={handleFileChange}
                className="block w-full text-sm text-slate-500 
                           file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold 
                           file:bg-slate-200 file:text-sky-700 
                           hover:file:bg-slate-300 
                           cursor-pointer focus:outline-none"
              />
            </div>
          </div>

          {stagedSongs.length > 0 && (
            <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
              <h3 className="text-md font-medium">Staged Songs:</h3>
              {stagedSongs.map((sSong) => (
                <div key={sSong.tempId} className={`${neumorphicOutsetSoft} p-3 space-y-2`}>
                  <div className="flex justify-between items-center">
                    <p className={`${neumorphicSubtleText} text-sm truncate`} title={sSong.fileName}>{sSong.fileName}</p>
                    <button
                      onClick={() => handleRemoveStagedSong(sSong.tempId)}
                      className={`${neumorphicIconButton} text-red-500 hover:text-red-600 -mt-1 -mr-1 p-1.5`}
                      aria-label="Remove song from staging"
                    >
                      <TrashIcon className="w-4 h-4" />
                    </button>
                  </div>
                  {sSong.isLoading && <p className="text-xs text-sky-600">Loading metadata...</p>}
                  {sSong.error && <p className="text-xs text-red-600">{sSong.error}</p>}
                  {!sSong.isLoading && !sSong.error && (
                     <p className={`text-xs ${neumorphicSubtleText}`}>Duration: {formatDuration(sSong.durationSeconds)}</p>
                  )}
                  <NeumorphicInputField id={`title-${sSong.tempId}`} placeholder="Title" value={sSong.title} onChange={(e) => handleUpdateStagedSong(sSong.tempId, 'title', e.target.value)} disabled={sSong.isLoading}/>
                  <NeumorphicInputField id={`artist-${sSong.tempId}`} placeholder="Artist" value={sSong.artist} onChange={(e) => handleUpdateStagedSong(sSong.tempId, 'artist', e.target.value)} disabled={sSong.isLoading}/>
                </div>
              ))}
            </div>
          )}
        </div>
      </Modal>

      {renderReplaceSongModal()}
      {renderSwapPlaylistModal()}
      {renderSettingsModal()}
      {renderCreateShowModal()}

      <footer className={`text-center text-sm ${neumorphicSubtleText} mt-12 py-6 border-t border-slate-200`}>
        Radio Show Planner &copy; {new Date().getFullYear()}
      </footer>
    </div>
  );
};

export default App;
