import { getMeetingsNeedingReview, getReviewers } from '@/lib/db/reviews';
import { ReviewsTable } from '@/components/admin/reviews/ReviewsTable';
import { ReviewFilters } from '@/components/admin/reviews/ReviewFilters';
import { ReviewVolumeChart } from '@/components/admin/reviews/ReviewVolumeChart';
import { Last30DaysFilter } from '@/components/admin/reviews/Last30DaysFilter';
import { formatDistanceToNow } from 'date-fns';
import { formatDurationMs } from '@/lib/formatters/time';
import { Card, CardContent } from '@/components/ui/card';

interface PageProps {
  searchParams: { 
    show?: 'needsAttention' | 'all' | 'completed';
    reviewerId?: string;
    last30Days?: string;
  };
}

export default async function ReviewsPage({ searchParams }: PageProps) {
  const { show = 'needsAttention', reviewerId, last30Days } = searchParams;
  const last30DaysBool = last30Days !== 'false';
  
  const [reviews, reviewers] = await Promise.all([
    getMeetingsNeedingReview({ show, reviewerId, last30Days: last30DaysBool }),
    getReviewers(),
  ]);

  // Calculate metrics from reviews data
  const needsReview = reviews
    .filter(r => r.status !== 'completed')
    .reduce((sum, r) => sum + r.meetingDurationMs, 0);
  
  const oldestNeedsReview = reviews
    .filter(r => r.status !== 'completed')
    .sort((a, b) => a.meetingDate.getTime() - b.meetingDate.getTime())[0]?.meetingDate ?? null;
  
  return (
    <div className="container mx-auto py-8 px-4">
      <div className="mb-6">
        <div className="flex items-baseline gap-3">
          <h1 className="text-3xl font-bold">Transcript Reviews</h1>
          <span className="text-lg text-muted-foreground">
            {reviews.length} {reviews.length === 1 ? 'meeting' : 'meetings'}
          </span>
        </div>
        <p className="text-muted-foreground mt-2">
          Track and manage human review progress on meeting transcripts
        </p>
      </div>

      {/* Review Volume Chart - Not affected by 30-day filter */}
      <div className="mb-6">
        <ReviewVolumeChart />
      </div>

      {/* 30-Day Filter - Prominent at top */}
      <Last30DaysFilter last30Days={last30DaysBool} />

      {/* Metrics Display */}
      <div className="grid grid-cols-1 md:grid-cols-1 gap-4 mb-6">
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{formatDurationMs(needsReview)}</div>
            <div className="text-sm text-muted-foreground mt-1">
              Meeting time needs review
            </div>
            {oldestNeedsReview && (
              <div className="text-xs text-muted-foreground mt-2">
                Oldest: {formatDistanceToNow(oldestNeedsReview, { addSuffix: true })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
      
      <div className="flex flex-col md:flex-row gap-4 mb-6">
        <ReviewFilters 
          show={show}
          reviewerId={reviewerId}
          reviewers={reviewers}
        />
      </div>
      
      <ReviewsTable reviews={reviews} />
    </div>
  );
}

