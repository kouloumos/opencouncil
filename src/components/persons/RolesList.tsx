"use client"
import { useState } from 'react'
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useTranslations } from 'next-intl'
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import { z } from "zod"
import { Loader2, Pencil, Trash2 } from "lucide-react"
import { Party, AdministrativeBody, Role } from '@prisma/client'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Calendar } from "@/components/ui/calendar"
import { cn } from "@/lib/utils"
import { format } from "date-fns"
import { CalendarIcon } from "lucide-react"

const formSchema = z.object({
    name: z.string().optional(),
    name_en: z.string().optional(),
    isHead: z.boolean().default(false),
    startDate: z.date().nullable(),
    endDate: z.date().nullable(),
    type: z.enum(['city', 'party', 'administrativeBody']),
    partyId: z.string().optional(),
    administrativeBodyId: z.string().optional(),
})

interface RoleWithRelations extends Role {
    party?: Party | null;
    administrativeBody?: AdministrativeBody | null;
}

interface RolesListProps {
    personId?: string;
    cityId: string;
    roles: RoleWithRelations[];
    parties: Party[];
    administrativeBodies: AdministrativeBody[];
    onUpdate: (roles: RoleWithRelations[]) => void;
}

export default function RolesList({ personId, cityId, roles, parties, administrativeBodies, onUpdate }: RolesListProps) {
    const [isDialogOpen, setIsDialogOpen] = useState(false)
    const [editingRole, setEditingRole] = useState<RoleWithRelations | null>(null)
    const t = useTranslations('RolesList')

    const form = useForm<z.infer<typeof formSchema>>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            name: editingRole?.name || "",
            name_en: editingRole?.name_en || "",
            isHead: editingRole?.isHead || false,
            startDate: editingRole?.startDate || null,
            endDate: editingRole?.endDate || null,
            type: editingRole?.partyId ? 'party' : editingRole?.administrativeBodyId ? 'administrativeBody' : 'city',
            partyId: editingRole?.partyId || undefined,
            administrativeBodyId: editingRole?.administrativeBodyId || undefined,
        },
    })

    const handleSubmit = (values: z.infer<typeof formSchema>, e: React.FormEvent) => {
        e.preventDefault(); // Prevent form submission

        const newRole: RoleWithRelations = {
            id: editingRole?.id || Math.random().toString(), // Temporary ID for new roles
            personId: personId || '',
            cityId: values.type === 'city' ? cityId : null,
            partyId: values.type === 'party' ? values.partyId || null : null,
            administrativeBodyId: values.type === 'administrativeBody' ? values.administrativeBodyId || null : null,
            name: values.name || null,
            name_en: values.name_en || null,
            isHead: values.isHead,
            startDate: values.startDate,
            endDate: values.endDate,
            createdAt: new Date(),
            updatedAt: new Date(),
        }

        if (values.type === 'party' && values.partyId) {
            newRole.party = parties.find(p => p.id === values.partyId) || null
        } else if (values.type === 'administrativeBody' && values.administrativeBodyId) {
            newRole.administrativeBody = administrativeBodies.find(b => b.id === values.administrativeBodyId) || null
        }

        const updatedRoles = editingRole
            ? roles.map(role => role.id === editingRole.id ? newRole : role)
            : [...roles, newRole]

        onUpdate(updatedRoles)
        setEditingRole(null)
        form.reset()
        setIsDialogOpen(false)
    }

    const handleDelete = (roleToDelete: RoleWithRelations) => {
        if (!confirm(t('confirmDelete'))) return
        const updatedRoles = roles.filter(role => role.id !== roleToDelete.id)
        onUpdate(updatedRoles)
    }

    const roleType = form.watch('type')

    return (
        <div className="space-y-4" onClick={(e) => e.stopPropagation()}>
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogTrigger asChild>
                    <Button onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setEditingRole(null)
                        form.reset({
                            name: "",
                            name_en: "",
                            isHead: false,
                            startDate: null,
                            endDate: null,
                            type: 'city',
                            partyId: undefined,
                            administrativeBodyId: undefined,
                        })
                        setIsDialogOpen(true)
                    }}>
                        {t('addNew')}
                    </Button>
                </DialogTrigger>
                <DialogContent onClick={(e) => e.stopPropagation()}>
                    <DialogHeader>
                        <DialogTitle>
                            {editingRole ? t('editRole') : t('addRole')}
                        </DialogTitle>
                    </DialogHeader>
                    <Form {...form}>
                        <form onSubmit={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            form.handleSubmit((values) => handleSubmit(values, e))();
                        }} className="space-y-4" onClick={(e) => e.stopPropagation()}>
                            <FormField
                                control={form.control}
                                name="type"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>{t('type')}</FormLabel>
                                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                                            <FormControl>
                                                <SelectTrigger>
                                                    <SelectValue placeholder={t('selectType')} />
                                                </SelectTrigger>
                                            </FormControl>
                                            <SelectContent>
                                                <SelectItem value="city">{t('types.city')}</SelectItem>
                                                <SelectItem value="party">{t('types.party')}</SelectItem>
                                                <SelectItem value="administrativeBody">{t('types.administrativeBody')}</SelectItem>
                                            </SelectContent>
                                        </Select>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            {roleType === 'party' && (
                                <FormField
                                    control={form.control}
                                    name="partyId"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>{t('party')}</FormLabel>
                                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                                                <FormControl>
                                                    <SelectTrigger>
                                                        <SelectValue placeholder={t('selectParty')} />
                                                    </SelectTrigger>
                                                </FormControl>
                                                <SelectContent>
                                                    {parties.map(party => (
                                                        <SelectItem key={party.id} value={party.id}>
                                                            {party.name}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            )}

                            {roleType === 'administrativeBody' && (
                                <FormField
                                    control={form.control}
                                    name="administrativeBodyId"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>{t('administrativeBody')}</FormLabel>
                                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                                                <FormControl>
                                                    <SelectTrigger>
                                                        <SelectValue placeholder={t('selectAdministrativeBody')} />
                                                    </SelectTrigger>
                                                </FormControl>
                                                <SelectContent>
                                                    {administrativeBodies.map(body => (
                                                        <SelectItem key={body.id} value={body.id}>
                                                            {body.name}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            )}

                            <FormField
                                control={form.control}
                                name="name"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>{t('name')}</FormLabel>
                                        <FormControl>
                                            <Input {...field} value={field.value || ''} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            <FormField
                                control={form.control}
                                name="name_en"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>{t('nameEn')}</FormLabel>
                                        <FormControl>
                                            <Input {...field} value={field.value || ''} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            <FormField
                                control={form.control}
                                name="isHead"
                                render={({ field }) => (
                                    <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                                        <div className="space-y-0.5">
                                            <FormLabel className="text-base">
                                                {t('isHead')}
                                            </FormLabel>
                                            <FormDescription>
                                                {t('isHeadDescription')}
                                            </FormDescription>
                                        </div>
                                        <FormControl>
                                            <Switch
                                                checked={field.value}
                                                onCheckedChange={field.onChange}
                                            />
                                        </FormControl>
                                    </FormItem>
                                )}
                            />

                            <div className="flex gap-4">
                                <FormField
                                    control={form.control}
                                    name="startDate"
                                    render={({ field }) => (
                                        <FormItem className="flex flex-col flex-1">
                                            <FormLabel>{t('startDate')}</FormLabel>
                                            <Popover>
                                                <PopoverTrigger asChild>
                                                    <FormControl>
                                                        <Button
                                                            variant={"outline"}
                                                            className={cn(
                                                                "w-full pl-3 text-left font-normal",
                                                                !field.value && "text-muted-foreground"
                                                            )}
                                                        >
                                                            {field.value ? (
                                                                format(field.value, "PPP")
                                                            ) : (
                                                                <span>{t('pickDate')}</span>
                                                            )}
                                                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                                                        </Button>
                                                    </FormControl>
                                                </PopoverTrigger>
                                                <PopoverContent className="w-auto p-0" align="start">
                                                    <Calendar
                                                        mode="single"
                                                        selected={field.value || undefined}
                                                        onSelect={field.onChange}
                                                        initialFocus
                                                    />
                                                </PopoverContent>
                                            </Popover>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />

                                <FormField
                                    control={form.control}
                                    name="endDate"
                                    render={({ field }) => (
                                        <FormItem className="flex flex-col flex-1">
                                            <FormLabel>{t('endDate')}</FormLabel>
                                            <Popover>
                                                <PopoverTrigger asChild>
                                                    <FormControl>
                                                        <Button
                                                            variant={"outline"}
                                                            className={cn(
                                                                "w-full pl-3 text-left font-normal",
                                                                !field.value && "text-muted-foreground"
                                                            )}
                                                        >
                                                            {field.value ? (
                                                                format(field.value, "PPP")
                                                            ) : (
                                                                <span>{t('pickDate')}</span>
                                                            )}
                                                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                                                        </Button>
                                                    </FormControl>
                                                </PopoverTrigger>
                                                <PopoverContent className="w-auto p-0" align="start">
                                                    <Calendar
                                                        mode="single"
                                                        selected={field.value || undefined}
                                                        onSelect={field.onChange}
                                                        initialFocus
                                                    />
                                                </PopoverContent>
                                            </Popover>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            </div>

                            <Button type="submit">
                                {editingRole ? t('update') : t('create')}
                            </Button>
                        </form>
                    </Form>
                </DialogContent>
            </Dialog>

            <div className="grid gap-4">
                {roles.map((role) => (
                    <Card key={role.id} onClick={(e) => e.stopPropagation()}>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">
                                {role.name || (
                                    role.party?.name ||
                                    role.administrativeBody?.name ||
                                    t('cityRole')
                                )}
                                {role.isHead && ` (${t('head')})`}
                            </CardTitle>
                            <div className="flex space-x-2">
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        setEditingRole(role)
                                        form.reset({
                                            name: role.name || "",
                                            name_en: role.name_en || "",
                                            isHead: role.isHead,
                                            startDate: role.startDate,
                                            endDate: role.endDate,
                                            type: role.partyId ? 'party' : role.administrativeBodyId ? 'administrativeBody' : 'city',
                                            partyId: role.partyId || undefined,
                                            administrativeBodyId: role.administrativeBodyId || undefined,
                                        })
                                        setIsDialogOpen(true)
                                    }}
                                >
                                    <Pencil className="h-4 w-4" />
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        handleDelete(role)
                                    }}
                                >
                                    <Trash2 className="h-4 w-4" />
                                </Button>
                            </div>
                        </CardHeader>
                        <CardContent>
                            <div className="text-xs text-muted-foreground space-y-1">
                                <p>
                                    {role.name_en && `${role.name_en} - `}
                                    {role.party?.name_en || role.administrativeBody?.name_en || t('cityRole')}
                                </p>
                                {(role.startDate || role.endDate) && (
                                    <p>
                                        {role.startDate && format(new Date(role.startDate), "PPP")}
                                        {' - '}
                                        {role.endDate ? format(new Date(role.endDate), "PPP") : t('present')}
                                    </p>
                                )}
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>
        </div>
    )
} 