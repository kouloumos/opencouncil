"use client"
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import { z } from "zod"
import { Button } from "@/components/ui/button"
import {
    Form,
    FormControl,
    FormDescription,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { SheetClose } from "@/components/ui/sheet"
import { Offer } from '@prisma/client'
import { Loader2, Check } from "lucide-react"
import { useTranslations } from 'next-intl'
import { useToast } from "@/hooks/use-toast"
import { Calendar } from "@/components/ui/calendar"
import { Slider } from '@/components/ui/slider'
import { createOffer, updateOffer } from '@/lib/db/offers'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { formatCurrency } from '@/lib/utils'
import { calculateOfferTotals, CURRENT_OFFER_VERSION } from '@/lib/pricing'
import { listWorkspaces } from '@/lib/db/workspaces'

const formSchema = z.object({
    recipientName: z.string().min(2, {
        message: "Recipient name must be at least 2 characters.",
    }),
    ingestionPerHourPrice: z.number().min(0, {
        message: "Ingestion price per hour must be a positive number.",
    }),
    hoursToIngest: z.number().int().min(1, {
        message: "Hours to ingest must be at least 1.",
    }),
    discountPercentage: z.number().min(0).max(100, {
        message: "Discount percentage must be between 0 and 100.",
    }),
    type: z.string().default("pilot"),
    startDate: z.date().optional(),
    endDate: z.date().optional(),
    respondToName: z.string().min(2, {
        message: "Respond to name must be at least 2 characters.",
    }),
    respondToEmail: z.string().email({
        message: "Please enter a valid email address.",
    }),
    respondToPhone: z.string().min(10, {
        message: "Please enter a valid phone number.",
    }),
    workspaceId: z.string().optional(),
})

interface OfferFormProps {
    offer?: Offer
    onSuccess?: (data: z.infer<typeof formSchema>) => void
    workspaceId?: string
}

export default function OfferForm({ offer, onSuccess, workspaceId }: OfferFormProps) {
    const router = useRouter()
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [isSuccess, setIsSuccess] = useState(false)
    const [workspaces, setWorkspaces] = useState<{ id: string, name: string }[]>([])
    const t = useTranslations('OfferForm')
    const { toast } = useToast()

    useEffect(() => {
        const loadWorkspaces = async () => {
            try {
                const workspacesData = await listWorkspaces()
                setWorkspaces(workspacesData.map(ws => ({ id: ws.id, name: ws.name })))
            } catch (error) {
                console.error('Failed to load workspaces:', error)
            }
        }
        loadWorkspaces()
    }, [])

    const form = useForm<z.infer<typeof formSchema>>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            recipientName: offer?.recipientName || "",
            ingestionPerHourPrice: offer?.ingestionPerHourPrice || 0,
            hoursToIngest: offer?.hoursToIngest || 1,
            discountPercentage: offer?.discountPercentage || 0,
            type: offer?.type || "pilot",
            startDate: offer?.startDate || undefined,
            endDate: offer?.endDate || undefined,
            respondToName: offer?.respondToName || "",
            respondToEmail: offer?.respondToEmail || "",
            respondToPhone: offer?.respondToPhone || "",
            workspaceId: workspaceId || offer?.workspaceId || undefined,
        },
    })

    const watchedValues = form.watch()
    const { total } = calculateOfferTotals(watchedValues)

    async function onSubmit(values: z.infer<typeof formSchema>) {
        setIsSubmitting(true)
        try {
            const commonData = {
                recipientName: values.recipientName,
                ingestionPerHourPrice: values.ingestionPerHourPrice,
                hoursToIngest: values.hoursToIngest,
                discountPercentage: values.discountPercentage,
                type: values.type,
                startDate: values.startDate || null,
                endDate: values.endDate || null,
                respondToName: values.respondToName,
                respondToEmail: values.respondToEmail,
                respondToPhone: values.respondToPhone,
                workspaceId: values.workspaceId || null,
                version: CURRENT_OFFER_VERSION
            };

            if (offer) {
                await updateOffer(offer.id, commonData);
            } else {
                await createOffer(commonData);
            }

            setIsSuccess(true)
            setTimeout(() => setIsSuccess(false), 1000)
            if (onSuccess) {
                onSuccess(values)
            }
            router.refresh()
            form.reset({
                recipientName: "",
                ingestionPerHourPrice: 0,
                hoursToIngest: 1,
                discountPercentage: 0,
                type: "pilot",
                startDate: undefined,
                endDate: undefined,
                respondToName: "",
                respondToEmail: "",
                respondToPhone: "",
                workspaceId: undefined,
            })
            toast({
                title: t('success'),
                description: offer ? t('offerUpdated') : t('offerCreated'),
            })
        } catch (error) {
            console.error(t('failedToSaveOffer'), error)
            toast({
                title: t('error'),
                description: error instanceof Error ? error.message : t('unexpectedError'),
                variant: "destructive",
            })
        } finally {
            setIsSubmitting(false)
        }
    }

    return (
        <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <div className="bg-blue-50 p-4 rounded-lg mb-4">
                    <h3 className="font-semibold text-lg mb-2">{t('totalPrice')}</h3>
                    <p className="text-2xl font-bold">{formatCurrency(total)}</p>
                </div>

                {Object.keys(form.formState.errors).length > 0 && (
                    <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative" role="alert">
                        <strong className="font-bold">{t('formErrors')}</strong>
                        <ul className="mt-2 list-disc list-inside">
                            {Object.entries(form.formState.errors).map(([key, error]) => (
                                <li key={key}>{error.message}</li>
                            ))}
                        </ul>
                    </div>
                )}

                <FormField
                    control={form.control}
                    name="workspaceId"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Workspace</FormLabel>
                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                                <FormControl>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select workspace (optional)" />
                                    </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                    {workspaces.map((ws) => (
                                        <SelectItem key={ws.id} value={ws.id}>
                                            {ws.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <FormDescription>
                                Optional workspace association for this offer
                            </FormDescription>
                            <FormMessage />
                        </FormItem>
                    )}
                />

                <FormField
                    control={form.control}
                    name="recipientName"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>{t('recipientName')}</FormLabel>
                            <FormControl>
                                <Input {...field} />
                            </FormControl>
                            <FormDescription>
                                {t('recipientNameDescription')}
                            </FormDescription>
                            <FormMessage />
                        </FormItem>
                    )}
                />

                <FormField
                    control={form.control}
                    name="ingestionPerHourPrice"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>{t('ingestionPerHourPrice')}</FormLabel>
                            <FormControl>
                                <Input
                                    type="number"
                                    {...field}
                                    onChange={e => field.onChange(parseFloat(e.target.value))}
                                />
                            </FormControl>
                            <FormDescription>
                                {t('ingestionPerHourPriceDescription')}
                            </FormDescription>
                            <FormMessage />
                        </FormItem>
                    )}
                />

                <FormField
                    control={form.control}
                    name="hoursToIngest"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>{t('hoursToIngest')}</FormLabel>
                            <FormControl>
                                <Input
                                    type="number"
                                    {...field}
                                    onChange={e => field.onChange(parseInt(e.target.value))}
                                />
                            </FormControl>
                            <FormDescription>
                                {t('hoursToIngestDescription')}
                            </FormDescription>
                            <FormMessage />
                        </FormItem>
                    )}
                />

                <FormField
                    control={form.control}
                    name="discountPercentage"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>{t('discountPercentage')}</FormLabel>
                            <FormControl>
                                <div className="flex items-center gap-2">
                                    <Slider
                                        min={0}
                                        max={100}
                                        step={1}
                                        value={[field.value]}
                                        onValueChange={([value]) => field.onChange(value)}
                                    />
                                    <span className="w-12 text-sm">{field.value}%</span>
                                </div>
                            </FormControl>
                            <FormDescription>
                                {t('discountPercentageDescription')}
                            </FormDescription>
                            <FormMessage />
                        </FormItem>
                    )}
                />

                <FormField
                    control={form.control}
                    name="startDate"
                    render={({ field }) => (
                        <FormItem className="flex flex-col">
                            <FormLabel>{t('startDate')}</FormLabel>
                            <Calendar
                                mode="single"
                                selected={field.value}
                                onSelect={field.onChange}
                                disabled={(date) =>
                                    date < new Date()
                                }
                                initialFocus
                            />
                            <FormDescription>
                                {t('startDateDescription')}
                            </FormDescription>
                            <FormMessage />
                        </FormItem>
                    )}
                />

                <FormField
                    control={form.control}
                    name="endDate"
                    render={({ field }) => (
                        <FormItem className="flex flex-col">
                            <FormLabel>{t('endDate')}</FormLabel>
                            <Calendar
                                mode="single"
                                selected={field.value}
                                onSelect={field.onChange}
                                disabled={(date) => {
                                    const startDate = form.getValues('startDate');
                                    return startDate ? date < startDate : false;
                                }}
                                initialFocus
                            />
                            <FormDescription>
                                {t('endDateDescription')}
                            </FormDescription>
                            <FormMessage />
                        </FormItem>
                    )}
                />

                <FormField
                    control={form.control}
                    name="respondToName"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>{t('respondToName')}</FormLabel>
                            <FormControl>
                                <Input {...field} />
                            </FormControl>
                            <FormDescription>
                                {t('respondToNameDescription')}
                            </FormDescription>
                            <FormMessage />
                        </FormItem>
                    )}
                />

                <FormField
                    control={form.control}
                    name="respondToEmail"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>{t('respondToEmail')}</FormLabel>
                            <FormControl>
                                <Input type="email" {...field} />
                            </FormControl>
                            <FormDescription>
                                {t('respondToEmailDescription')}
                            </FormDescription>
                            <FormMessage />
                        </FormItem>
                    )}
                />

                <FormField
                    control={form.control}
                    name="respondToPhone"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>{t('respondToPhone')}</FormLabel>
                            <FormControl>
                                <Input type="tel" {...field} />
                            </FormControl>
                            <FormDescription>
                                {t('respondToPhoneDescription')}
                            </FormDescription>
                            <FormMessage />
                        </FormItem>
                    )}
                />

                <div className="flex justify-between">
                    <Button type="submit" disabled={isSubmitting}>
                        {isSubmitting ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                {t('submitting')}
                            </>
                        ) : isSuccess ? (
                            <>
                                <Check className="mr-2 h-4 w-4" />
                                {t('success')}
                            </>
                        ) : (
                            <>{offer ? t('updateOffer') : t('createOffer')}</>
                        )}
                    </Button>
                    <SheetClose asChild>
                        <Button type="button" variant="outline">{t('cancel')}</Button>
                    </SheetClose>
                </div>
            </form>
        </Form>
    )
}
