import React, { useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuLabel } from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { toast } from "sonner";
import { Play, Upload, Film, Tv, Plus, Search, Filter, Save, FolderDown, FolderUp, Trash2, MoreHorizontal, RefreshCcw, Clapperboard, LogIn, LogOut, Shield } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { auth, db, storage, provider } from "./firebase";
import { onAuthStateChanged, signInWithPopup, signOut } from "firebase/auth";
import { addDoc, collection, deleteDoc, doc, onSnapshot, orderBy, query, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";
import { getDownloadURL, ref, uploadBytesResumable } from "firebase/storage";

const DEFAULT_POSTER =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='1200' height='1800' viewBox='0 0 1200 1800'%3E%3Crect width='1200' height='1800' fill='%231a1b1e'/%3E%3Cpath d='M280 350h640v1100H280z' stroke='%236a6f7a' stroke-width='16' fill='none'/%3E%3Cpath d='M420 540h360M420 690h360M420 840h240' stroke='%236a6f7a' stroke-width='24'/%3E%3Cpath d='M840 540l120 70-120 70V540z' fill='%236a6f7a'/%3E%3C/svg%3E";

const GENRES = ["Action","Adventure","Animation","Comedy","Crime","Documentary","Drama","Family","Fantasy","History","Horror","Mystery","Romance","Sci-Fi","Thriller"];
const SORTS = [
  { id: "newest", label: "Newest year" },
  { id: "oldest", label: "Oldest year" },
  { id: "a-z", label: "Title A→Z" },
  { id: "z-a", label: "Title Z→A" },
];

export default function App() {
  const [user, setUser] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  const [q, setQ] = useState("");
  const [type, setType] = useState("all");
  const [genre, setGenre] = useState("all");
  const [sort, setSort] = useState("newest");
  const [player, setPlayer] = useState(null);
  const [openAdd, setOpenAdd] = useState(false);

  // Auth state
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      const adminUid = import.meta.env.VITE_ADMIN_UID || "";
      setIsAdmin(Boolean(u && adminUid && u.uid === adminUid));
    });
    return () => unsub();
  }, []);

  // Titles realtime
  useEffect(() => {
    const qRef = query(collection(db, "titles"), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(qRef, (snap) => {
      const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setItems(docs);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  // Derived list client-side filters
  const list = useMemo(() => {
    let arr = [...items];
    if (q.trim()) {
      const t = q.toLowerCase();
      arr = arr.filter(
        (i) =>
          i.title?.toLowerCase().includes(t) ||
          i.cast?.toLowerCase().includes(t) ||
          i.description?.toLowerCase().includes(t)
      );
    }
    if (type !== "all") arr = arr.filter((i) => i.type === type);
    if (genre !== "all") arr = arr.filter((i) => (i.genres || []).includes(genre));
    switch (sort) {
      case "newest": arr.sort((a,b) => (b.year||0)-(a.year||0)); break;
      case "oldest": arr.sort((a,b) => (a.year||0)-(b.year||0)); break;
      case "a-z": arr.sort((a,b) => a.title.localeCompare(b.title)); break;
      case "z-a": arr.sort((a,b) => b.title.localeCompare(a.title)); break;
    }
    return arr;
  }, [items, q, type, genre, sort]);

  // CRUD helpers (admin only)
  async function upsertItemFirebase(item, files) {
    // files: { posterFile?, trailerFile? }
    const isNew = !item.id;
    const docRef = isNew ? await addDoc(collection(db, "titles"), {
      title: item.title,
      type: item.type,
      year: item.year,
      genres: item.genres || [],
      cast: item.cast || "",
      description: item.description || "",
      posterUrl: "",
      trailerUrl: "",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      createdBy: user?.uid || null,
    }) : doc(db, "titles", item.id);

    const id = isNew ? docRef.id : item.id;

    let posterUrl = item.posterUrl || "";
    let trailerUrl = item.trailerUrl || "";

    if (files?.posterFile) {
      posterUrl = await uploadWithProgress(files.posterFile, `posters/${id}-${files.posterFile.name}`);
    }
    if (files?.trailerFile) {
      trailerUrl = await uploadWithProgress(files.trailerFile, `trailers/${id}-${files.trailerFile.name}`);
    }

    const payload = {
      title: item.title,
      type: item.type,
      year: item.year,
      genres: item.genres || [],
      cast: item.cast || "",
      description: item.description || "",
      posterUrl: posterUrl || item.posterUrl || "",
      trailerUrl: trailerUrl || item.trailerUrl || "",
      updatedAt: serverTimestamp(),
    };

    if (isNew) {
      await updateDoc(doc(db, "titles", id), payload);
    } else {
      await setDoc(doc(db, "titles", id), { ...payload, createdBy: item.createdBy || user?.uid || null }, { merge: true });
    }

    toast.success(isNew ? "Added to catalog" : "Saved changes");
  }

  async function uploadWithProgress(file, path) {
    const storageRef = ref(storage, path);
    const task = uploadBytesResumable(storageRef, file);
    return new Promise((resolve, reject) => {
      task.on('state_changed', (snap) => {
        const pct = Math.round((snap.bytesTransferred / snap.totalBytes) * 100);
        toast.message(`Uploading ${file.name}…`, { description: `${pct}%` });
      }, reject, async () => {
        const url = await getDownloadURL(task.snapshot.ref);
        resolve(url);
      });
    });
  }

  async function removeItemFirebase(id) {
    await deleteDoc(doc(db, "titles", id));
    toast("Deleted");
  }

  // UI
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-925 to-slate-900 text-slate-100">
      <header className="sticky top-0 z-20 backdrop-blur border-b border-slate-800/60 bg-slate-950/60">
        <div className="mx-auto max-w-7xl px-4 py-3 flex items-center justify-between">
          <div className="flex items中心 gap-3">
            <Clapperboard className="size-6" />
            <h1 className="text-xl font-semibold tracking-tight">ReelRack — Movies & TV Catalog</h1>
            {isAdmin && <span className="text-xs ml-2 inline-flex items-center gap-1 text-emerald-400"><Shield className="size-3"/> Admin</span>}
          </div>
          <div className="flex items-center gap-2">
            <div className="hidden md:block">
              <CatalogSearch q={q} setQ={setQ} />
            </div>
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="secondary" className="gap-2"><Filter className="size-4"/> Filters</Button>
              </SheetTrigger>
              <SheetContent side="right" className="bg-slate-950 border-slate-800">
                <SheetHeader>
                  <SheetTitle>Filter & Sort</SheetTitle>
                </SheetHeader>
                <div className="mt-6 space-y-6">
                  <div className="space-y-2">
                    <Label>Type</Label>
                    <Tabs value={type} onValueChange={setType} className="w-full">
                      <TabsList className="grid grid-cols-3 w-full">
                        <TabsTrigger value="all">All</TabsTrigger>
                        <TabsTrigger value="movie" className="gap-2"><Film className="size-4"/>Movies</TabsTrigger>
                        <TabsTrigger value="tv" className="gap-2"><Tv className="size-4"/>TV</TabsTrigger>
                      </TabsList>
                    </Tabs>
                  </div>
                  <div className="space-y-2">
                    <Label>Genre</Label>
                    <Select value={genre} onValueChange={setGenre}>
                      <SelectTrigger className="bg-slate-900 border-slate-800">
                        <SelectValue placeholder="All genres" />
                      </SelectTrigger>
                      <SelectContent className="bg-slate-950 border-slate-800">
                        <SelectItem value="all">All</SelectItem>
                        {GENRES.map((g) => (
                          <SelectItem key={g} value={g}>{g}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Sort by</Label>
                    <Select value={sort} onValueChange={setSort}>
                      <SelectTrigger className="bg-slate-900 border-slate-800">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-slate-950 border-slate-800">
                        {SORTS.map((s) => (
                          <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="block md:hidden">
                    <Label>Search</Label>
                    <CatalogSearch q={q} setQ={setQ} />
                  </div>
                </div>
              </SheetContent>
            </Sheet>

            {isAdmin && (
              <Button className="gap-2" onClick={() => setOpenAdd(true)}>
                <Plus className="size-4" /> Add Title
              </Button>
            )}

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="border-slate-800"><MoreHorizontal className="size-4"/></Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="bg-slate-950 border-slate-800">
                <DropdownMenuLabel>Catalog</DropdownMenuLabel>
                <DropdownMenuItem onClick={() => exportJSON(list)} className="gap-2"><FolderDown className="size-4"/>Export JSON (view)</DropdownMenuItem>
                <DropdownMenuItem className="gap-2 relative">
                  <FolderUp className="size-4"/> Import JSON (admin)
                  {isAdmin && <input type="file" accept="application/json" onChange={(e)=>importJSONAdmin(e)} className="absolute inset-0 opacity-0 cursor-pointer" />}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                {!user ? (
                  <DropdownMenuItem onClick={() => signInWithPopup(auth, provider)} className="gap-2"><LogIn className="size-4"/> Sign in with Google</DropdownMenuItem>
                ) : (
                  <DropdownMenuItem onClick={() => signOut(auth)} className="gap-2 text-amber-300"><LogOut className="size-4"/> Sign out</DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8">
        {loading ? (
          <div className="text-center py-20 text-slate-400">Loading…</div>
        ) : (
          <AnimatePresence>
            {list.length === 0 ? (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-24 text-slate-400">
                No titles yet.
              </motion.div>
            ) : (
              <div className="grid sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                {list.map((item) => (
                  <motion.div key={item.id} layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                    <CatalogCard
                      item={item}
                      onPlay={() => setPlayer(item)}
                      onDelete={isAdmin ? () => removeItemFirebase(item.id) : null}
                      onEdit={isAdmin ? (it, files) => upsertItemFirebase(it, files) : null}
                      isAdmin={isAdmin}
                    />
                  </motion.div>
                ))}
              </div>
            )}
          </AnimatePresence>
        )}
      </main>

      <AddEditDialog
        open={openAdd}
        onOpenChange={setOpenAdd}
        onSave={(it, files) => { upsertItemFirebase(it, files); setOpenAdd(false); }}
        isAdmin={isAdmin}
      />

      <TrailerDialog item={player} onOpenChange={(o) => !o && setPlayer(null)} />

      <footer className="mx-auto max-w-7xl px-4 pb-10 pt-2 text-xs text-slate-500 flex items-center justify-between">
        <span>Firebase-enabled. Sign in as admin to add/edit titles.</span>
        <a className="underline underline-offset-4" href="https://firebase.google.com/docs" target="_blank" rel="noreferrer">Firebase Docs</a>
      </footer>
    </div>
  );

  // helpers
  function exportJSON(data) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `catalog-export-${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }
  async function importJSONAdmin(e) {
    if (!isAdmin) return;
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    try {
      const arr = JSON.parse(text);
      if (!Array.isArray(arr)) throw new Error("Invalid file");
      for (const it of arr) {
        await upsertItemFirebase({
          id: it.id,
          title: it.title,
          type: it.type,
          year: it.year,
          genres: it.genres,
          cast: it.cast,
          description: it.description,
          posterUrl: it.posterUrl,
          trailerUrl: it.trailerUrl,
          createdBy: user?.uid || null,
        });
      }
      toast.success("Imported");
    } catch (err) {
      toast.error("Could not import JSON");
    }
  }
}

function CatalogSearch({ q, setQ }) {
  return (
    <div className="relative">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-slate-500" />
      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search titles, cast, description" className="pl-9 bg-slate-900 border-slate-800 w-72" />
    </div>
  );
}

function CatalogCard({ item, onPlay, onDelete, onEdit, isAdmin }) {
  const [open, setOpen] = useState(false);
  return (
    <Card className="bg-slate-950/60 border-slate-800 overflow-hidden group">
      <div className="relative aspect-[2/3] overflow-hidden">
        <img src={item.posterUrl || item.poster || DEFAULT_POSTER} alt={item.title} className="h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
        <div className="absolute inset-x-2 bottom-2 flex gap-2 justify-between">
          <Button onClick={onPlay} size="sm" className="gap-2 w-full">
            <Play className="size-4"/> Play Trailer
          </Button>
        </div>
      </div>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="text-base leading-tight line-clamp-2">{item.title}</CardTitle>
            <div className="mt-1 text-xs text-slate-400 flex items-center gap-2">
              <Badge variant="outline" className="border-slate-700 bg-slate-900 text-slate-300 capitalize">{item.type}</Badge>
              {item.year && <span>{item.year}</span>}
            </div>
          </div>
          {isAdmin && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="icon" variant="ghost" className="hover:bg-slate-900"><MoreHorizontal className="size-4"/></Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="bg-slate-950 border-slate-800">
                <DropdownMenuItem onClick={() => setOpen(true)}>Edit</DropdownMenuItem>
                <DropdownMenuItem className="text-red-400" onClick={onDelete}><Trash2 className="size-4 mr-2"/>Delete</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-1">
          {(item.genres || []).slice(0, 4).map((g) => (
            <Badge key={g} variant="secondary" className="bg-slate-800 text-slate-200">{g}</Badge>
          ))}
        </div>
        {item.description && <p className="mt-2 text-sm text-slate-400 line-clamp-3">{item.description}</p>}
      </CardContent>

      <AddEditDialog open={open} onOpenChange={setOpen} initial={item} onSave={onEdit} isAdmin={isAdmin} />
    </Card>
  );
}

function AddEditDialog({ open, onOpenChange, onSave, initial, isAdmin }) {
  const [title, setTitle] = useState(initial?.title || "");
  const [type, setType] = useState(initial?.type || "movie");
  const [year, setYear] = useState(String(initial?.year || ""));
  const [genres, setGenres] = useState(initial?.genres || []);
  const [cast, setCast] = useState(initial?.cast || "");
  const [description, setDescription] = useState(initial?.description || "");
  const [posterUrl, setPosterUrl] = useState(initial?.posterUrl || "");
  const [trailerUrl, setTrailerUrl] = useState(initial?.trailerUrl || "");
  const [posterFile, setPosterFile] = useState(null);
  const [trailerFile, setTrailerFile] = useState(null);

  useEffect(() => {
    if (open) {
      setTitle(initial?.title || "");
      setType(initial?.type || "movie");
      setYear(String(initial?.year || ""));
      setGenres(initial?.genres || []);
      setCast(initial?.cast || "");
      setDescription(initial?.description || "");
      setPosterUrl(initial?.posterUrl || "");
      setTrailerUrl(initial?.trailerUrl || "");
      setPosterFile(null);
      setTrailerFile(null);
    }
  }, [open, initial]);

  function toggleGenre(g) {
    setGenres((prev) => (prev.includes(g) ? prev.filter((x) => x !== g) : [...prev, g]));
  }

  function handleSave() {
    if (!isAdmin) return toast.error("Admin only");
    if (!title.trim()) return toast.error("Title is required");
    if (!year || isNaN(Number(year))) return toast.error("Enter a valid year");
    const item = {
      id: initial?.id,
      title: title.trim(),
      type,
      year: Number(year),
      genres,
      cast: cast.trim(),
      description: description.trim(),
      posterUrl,
      trailerUrl,
      createdBy: initial?.createdBy,
    };
    onSave?.(item, { posterFile, trailerFile });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl bg-slate-950 border-slate-800">
        <DialogHeader>
          <DialogTitle>{initial ? "Edit Title" : "Add Title"}</DialogTitle>
        </DialogHeader>

        <div className="grid md:grid-cols-3 gap-6 py-2">
          <div className="md:col-span-1">
            <div className="aspect-[2/3] overflow-hidden rounded-xl bg-slate-900 border border-slate-800">
              <img src={posterFile ? URL.createObjectURL(posterFile) : (posterUrl || DEFAULT_POSTER)} alt="Poster" className="w-full h-full object-cover" />
            </div>
            <div className="mt-3">
              <Label className="text-xs text-slate-400">Poster (image)</Label>
              <div className="relative mt-1">
                <Button variant="outline" className="w-full border-slate-800">
                  <Upload className="size-4 mr-2"/> Choose poster image
                  <input type="file" accept="image/*" onChange={(e)=>setPosterFile(e.target.files?.[0]||null)} className="absolute inset-0 opacity-0 cursor-pointer" />
                </Button>
              </div>
            </div>
          </div>

          <div className="md:col-span-2 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Title</Label>
                <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g., Interstellar" className="bg-slate-900 border-slate-800" />
              </div>
              <div className="space-y-2">
                <Label>Type</Label>
                <Select value={type} onValueChange={setType}>
                  <SelectTrigger className="bg-slate-900 border-slate-800">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-950 border-slate-800">
                    <SelectItem value="movie">Movie</SelectItem>
                    <SelectItem value="tv">TV Show</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Year</Label>
                <Input inputMode="numeric" value={year} onChange={(e) => setYear(e.target.value)} placeholder="2024" className="bg-slate-900 border-slate-800" />
              </div>
              <div className="space-y-2">
                <Label>Cast</Label>
                <Input value={cast} onChange={(e) => setCast(e.target.value)} placeholder="Lead actors" className="bg-slate-900 border-slate-800" />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Short synopsis" className="bg-slate-900 border-slate-800 min-h-24" />
            </div>

            <div className="space-y-2">
              <Label>Genres</Label>
              <div className="flex flex-wrap gap-2">
                {GENRES.map((g) => (
                  <button key={g} onClick={() => toggleGenre(g)} className={[
                    "px-3 py-1 rounded-full text-sm border",
                    genres.includes(g) ? "bg-slate-200 text-slate-900 border-slate-200" : "bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800",
                  ].join(' ')}>{g}</button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Trailer (video file)</Label>
              <div className="relative">
                <Button variant="outline" className="w-full justify-start border-slate-800">
                  <Upload className="size-4 mr-2"/> Choose video (MP4/WebM)
                  <input type="file" accept="video/*" onChange={(e)=>setTrailerFile(e.target.files?.[0]||null)} className="absolute inset-0 opacity-0 cursor-pointer" />
                </Button>
                {(trailerFile || trailerUrl) && (
                  <p className="mt-2 text-xs text-slate-400 truncate">Selected: {trailerFile?.name || trailerUrl}</p>
                )}
              </div>
              <p className="text-xs text-slate-500">Tip: Use H.264 MP4 (AAC audio) for widest compatibility.</p>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} className="border-slate-800">Cancel</Button>
          <Button onClick={handleSave} className="gap-2"><Save className="size-4"/> Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TrailerDialog({ item, onOpenChange }) {
  const open = Boolean(item);
  const videoRef = useRef(null);
  useEffect(() => {
    if (!open && videoRef.current) {
      videoRef.current.pause();
    }
  }, [open]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl bg-slate-950 border-slate-800">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Play className="size-4"/> Trailer — {item?.title}</DialogTitle>
        </DialogHeader>
        {item?.trailerUrl ? (
          <div className="rounded-xl overflow-hidden border border-slate-800">
            <video ref={videoRef} className="w-full h-auto" src={item.trailerUrl} controls playsInline />
          </div>
        ) : (
          <div className="p-8 text-center text-slate-400">
            No trailer uploaded yet. Admin can add one.
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
