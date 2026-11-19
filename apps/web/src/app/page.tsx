import { Suspense } from "react";

import { loadSnapshot } from "@/lib/snapshot";

async function Corpus() {
  const snapshot = await loadSnapshot();
  return (
    <ul>
      {snapshot.posts.map((post) => (
        <li key={post.id}>{post.text}</li>
      ))}
    </ul>
  );
}

export default function Home() {
  return (
    <Suspense fallback={<p>Loading</p>}>
      <Corpus />
    </Suspense>
  );
}
