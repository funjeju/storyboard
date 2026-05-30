import ActionBoardDetail from "@/components/ActionBoardDetail";

export default function Page({ params }: { params: { id: string } }) {
  return <ActionBoardDetail boardId={params.id} />;
}
